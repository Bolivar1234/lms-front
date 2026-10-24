// Post-deploy role click-through on staging (e2e-school).
// Creates temporary student/teacher/admin users and one course, crawls each role's
// dashboard links, opens the AI-evals panels, then deletes everything it created.
//
//   node scripts/staging-smoke/role-clickthrough.mjs
//
// Env: ENV_FILE (default .env.local; needs the staging anon + service-role keys),
// SMOKE_OUT (screenshots/results, default test-results/staging-smoke),
// PW_CHROMIUM_PATH (optional browser binary), ONLY_AI=1 (teacher AI-evals checks only).
// Exits 1 when any check fails.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { chromium } from '@playwright/test'

const env = Object.fromEntries(fs.readFileSync(process.env.ENV_FILE || new URL('../../.env.local', import.meta.url), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const SUPA = 'https://api-staging.saythanks.org'
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
const SR = env.SUPABASE_SERVICE_ROLE_KEY
const HOST = 'https://e2e-school.circles.saythanks.org'
const T1 = '7e570000-0000-4000-8000-00000000e2e1'
const OUT = process.env.SMOKE_OUT || 'test-results/staging-smoke'
fs.mkdirSync(OUT, { recursive: true })
const ts = Date.now()
const adm = { apikey: SR, Authorization: `Bearer ${SR}`, 'content-type': 'application/json' }
const lms = (x = {}) => ({ ...adm, 'Accept-Profile': 'lms', 'Content-Profile': 'lms', ...x })
const rest = async (path, opts = {}) => {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: lms(opts.headers) })
  const text = await r.text()
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path}: ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
const insert = (table, row) => rest(table, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }).then((r) => r[0])

async function mkUser(role) {
  const email = `qa-${role}-${ts}@example.invalid`
  const u = await (await fetch(`${SUPA}/auth/v1/admin/users`, { method: 'POST', headers: adm, body: JSON.stringify({ email, password: crypto.randomBytes(18).toString('base64url'), email_confirm: true, user_metadata: { full_name: `QA ${role}` }, app_metadata: { tenant_id: T1 } }) })).json()
  if (!u.id) throw new Error(`user ${role}: ${JSON.stringify(u).slice(0, 200)}`)
  await rest('tenant_users', { method: 'POST', body: JSON.stringify({ tenant_id: T1, user_id: u.id, role, status: 'active' }), headers: { Prefer: 'return=minimal' } })
  await rest('user_roles', { method: 'POST', body: JSON.stringify({ user_id: u.id, role }), headers: { Prefer: 'return=minimal' } }).catch((e) => console.log('  user_roles:', e.message.slice(0, 120)))
  return { id: u.id, email, role }
}
async function session(email) {
  const gl = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: 'POST', headers: adm, body: JSON.stringify({ type: 'magiclink', email }) })).json()
  return (await fetch(`${SUPA}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: gl.hashed_token || gl.properties?.hashed_token }) })).json()
}
function cookiesFor(sess) {
  const base = 'sb-api-staging-auth-token'
  const val = 'base64-' + Buffer.from(JSON.stringify(sess)).toString('base64url')
  const parts = val.match(/.{1,3180}/g)
  const names = parts.length === 1 ? [base] : parts.map((_, i) => `${base}.${i}`)
  return parts.map((p, i) => ({ name: names[i], value: p, domain: '.circles.saythanks.org', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))
}

const ERROR_TEXT = /Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error|This page could not be found/i
async function visit(page, url, label, results) {
  const failed = []; const pageErrors = []; const consoleErrors = []
  const onResp = (r) => { if (r.status() >= 500 && r.url().startsWith(HOST)) failed.push(`${r.status()} ${r.url().replace(HOST, '')}`) }
  const onPageErr = (e) => pageErrors.push(String(e.message).slice(0, 200))
  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) }
  page.on('response', onResp); page.on('pageerror', onPageErr); page.on('console', onConsole)
  let status = 0
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    status = resp?.status() ?? 0
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  } catch (e) { pageErrors.push(`navigation: ${e.message.slice(0, 150)}`) }
  const body = await page.locator('body').innerText().catch(() => '')
  const errorText = (body.match(ERROR_TEXT) || [])[0] || ''
  const finalPath = page.url().replace(HOST, '')
  page.off('response', onResp); page.off('pageerror', onPageErr); page.off('console', onConsole)
  const bad = status >= 400 || failed.length || pageErrors.length || errorText
  const r = { role: label, path: url.replace(HOST, ''), finalPath, status, failed, pageErrors, consoleErrors: consoleErrors.slice(0, 5), errorText }
  results.push(r)
  if (bad) await page.screenshot({ path: `${OUT}/${label}-${results.length}.png`, fullPage: true }).catch(() => {})
  console.log(`${bad ? 'FAIL' : 'ok  '} ${label.padEnd(7)} ${status} ${r.path}${finalPath !== r.path ? ' -> ' + finalPath : ''}${errorText ? ' [' + errorText + ']' : ''}${failed.length ? ' 5xx:' + failed.join(',') : ''}${pageErrors.length ? ' pageerror:' + pageErrors[0] : ''}`)
  return r
}

async function crawl(browser, user, startPaths, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await ctx.addCookies(cookiesFor(await session(user.email)))
  const page = await ctx.newPage()
  const results = []; const seen = new Set(); const queue = [...startPaths]
  const prefix = `/dashboard/${user.role}`
  while (queue.length && seen.size < 45) {
    const p = queue.shift(); if (seen.has(p)) continue; seen.add(p)
    await visit(page, HOST + p, user.role, results)
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))).catch(() => [])
    for (const h of links) {
      if (!h || !h.startsWith(prefix) || /logout|sign-?out|delete/i.test(h)) continue
      const clean = h.split('#')[0]
      if (!seen.has(clean) && !queue.includes(clean)) queue.push(clean)
    }
  }
  if (extra) await extra(page, results)
  await ctx.close()
  return results
}

const created = { users: [], course: null, lesson: null, exercise: null, aiTask: null, entitlement: null }
const all = []
let browser
try {
  for (const role of ['student', 'teacher', 'admin']) created.users.push(await mkUser(role))
  const [student, teacher, admin] = created.users
  created.course = await insert('courses', { title: `QA click-through ${ts}`, description: 'Temporary course for the staging role check.', status: 'published', tenant_id: T1, author_id: teacher.id, require_sequential_completion: false, learning_objectives: [] })
  const cid = created.course.course_id
  created.lesson = await insert('lessons', { course_id: cid, tenant_id: T1, sequence: 1, title: 'QA lesson', content: '# Hello\n\nA short lesson.', status: 'published', is_preview: false })
  const lid = created.lesson.id
  created.aiTask = await insert('lessons_ai_tasks', { lesson_id: lid, system_prompt: 'You are a patient tutor.', task_instructions: 'Ask the student to explain the lesson in one sentence.' }).catch((e) => { console.log('  ai task:', e.message); return null })
  created.exercise = await insert('exercises', { course_id: cid, lesson_id: lid, tenant_id: T1, title: 'QA essay', instructions: 'Explain the lesson in two sentences.', exercise_type: 'essay', difficulty_level: 'easy', status: 'published', created_by: teacher.id }).catch((e) => { console.log('  exercise:', e.message); return null })
  created.entitlement = await insert('entitlements', { user_id: student.id, course_id: cid, tenant_id: T1, source_type: 'free', status: 'active' }).catch((e) => { console.log('  entitlement:', e.message); return null })
  console.log(`seeded course ${cid}, lesson ${lid}, exercise ${created.exercise?.id ?? '-'}, ai task ${created.aiTask?.id ?? '-'}`)

  browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
  const ONLY_AI = !!process.env.ONLY_AI
  if (!ONLY_AI) all.push(...await crawl(browser, student, ['/dashboard/student', `/dashboard/student/courses/${cid}`, `/dashboard/student/courses/${cid}/lessons/${lid}`]))
  all.push(...await crawl(browser, teacher, ONLY_AI ? [] : ['/dashboard/teacher', `/dashboard/teacher/courses/${cid}`], async (page, results) => {
    // AI evals: lesson task tests panel
    await visit(page, `${HOST}/dashboard/teacher/courses/${cid}/lessons/${lid}`, 'teacher', results)
    for (const name of [/AI task/i, /AI tutor/i, /^AI/i]) {
      const step = page.getByRole('button', { name }).or(page.getByRole('tab', { name })).first()
      if (await step.count()) { await step.click().catch(() => {}); break }
    }
    await page.waitForTimeout(3000)
    const lessonPanel = await page.getByText(/Task tests|Test(s)? (this|the) task|golden/i).first().isVisible().catch(() => false)
    await page.screenshot({ path: `${OUT}/teacher-lesson-ai-tests.png`, fullPage: true })
    console.log(`     lesson AI-evals panel visible: ${lessonPanel}`)
    results.push({ role: 'teacher', path: 'AI evals: lesson task tests panel', status: lessonPanel ? 200 : 0, failed: [], pageErrors: lessonPanel ? [] : ['panel not found'], consoleErrors: [], errorText: '' })
    if (created.exercise) {
      // The step switcher is not a tablist; use the "Set Up AI" call to action.
      await visit(page, `${HOST}/dashboard/teacher/courses/${cid}/exercises/${created.exercise.id}`, 'teacher', results)
      const setUp = page.getByRole('button', { name: /Set Up AI/i }).first()
      if (await setUp.count()) await setUp.click().catch(() => {})
      else await page.getByText('AI Evaluation', { exact: true }).first().click().catch(() => {})
      await page.waitForTimeout(3000)
      const exPanel = await page.getByText(/Grading tests|grading test|sample answers/i).first().isVisible().catch(() => false)
      await page.screenshot({ path: `${OUT}/teacher-exercise-ai-tests.png`, fullPage: true })
      console.log(`     exercise AI-evals panel visible: ${exPanel}`)
      results.push({ role: 'teacher', path: 'AI evals: exercise grading tests panel', status: exPanel ? 200 : 0, failed: [], pageErrors: exPanel ? [] : ['panel not found'], consoleErrors: [], errorText: '' })
    }
  }))
  if (!ONLY_AI) all.push(...await crawl(browser, admin, ['/dashboard/admin']))
} catch (e) {
  console.log('SETUP/RUN ERROR:', e.message)
} finally {
  if (browser) await browser.close()
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(all, null, 2))
  // cleanup: course data first, then users through the app's account-delete route
  const del = (path) => fetch(`${SUPA}/rest/v1/${path}`, { method: 'DELETE', headers: lms({ Prefer: 'return=minimal' }) }).then((r) => r.status)
  if (created.course) {
    const cid = created.course.course_id
    console.log('cleanup:',
      await del(`entitlements?course_id=eq.${cid}`),
      created.exercise ? await del(`exercises?id=eq.${created.exercise.id}`) : '-',
      await del(`lessons_ai_tasks?lesson_id=eq.${created.lesson?.id}`),
      await del(`lessons?course_id=eq.${cid}`),
      await del(`courses?course_id=eq.${cid}`))
  }
  for (const u of created.users) {
    const s = await session(u.email)
    const r = await fetch(`${HOST}/api/account/delete`, { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: u.email }) })
    let st = r.status
    if (st !== 200) { const a = await fetch(`${SUPA}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: adm }); st = `${st} (admin delete ${a.status})` }
    console.log(`cleanup user ${u.role}: ${st}`)
  }
  const bad = all.filter((r) => r.status >= 400 || r.failed?.length || r.pageErrors?.length || r.errorText)
  console.log(`\n${all.length} checks, ${bad.length} problems`)
  if (bad.length || !all.length) process.exitCode = 1
}
