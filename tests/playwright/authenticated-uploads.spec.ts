import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect, type Page } from './utils/test'
import { login } from './utils/auth'
import { BASE } from './utils/constants'
import { destroyQaTenant } from './utils/plan-gate-fixtures'
import { noisePng, tinyPdf } from './utils/images'

// These fixtures may only write to the disposable local stack, including in CI.
function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('Authenticated upload fixtures require disposable local Supabase.')
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function wav(): Buffer {
  const samples = 80_000 // Ten seconds of real, decodable PCM silence.
  const data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40)
  return data
}

const run = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
const tenant = { id: randomUUID(), slug: `qa-uploads-${run}`, name: 'Upload QA School', planSlug: `unused-${run}` }
const school = BASE.replace('://', `://${tenant.slug}.`)
const accounts = {
  student: { id: '', email: `qa-upload-student-${run}@e2etest.com`, password: 'password123' },
  teacher: { id: '', email: `qa-upload-teacher-${run}@e2etest.com`, password: 'password123' },
  admin: { id: '', email: `qa-upload-admin-${run}@e2etest.com`, password: 'password123' },
}
let admin: SupabaseClient
let courseId = 0
let lessonId = 0
let legacyReference = ''
const courseTitle = `Teacher-owned upload course ${run}`
const lessonTitle = `Private media ${run}`

async function removeTree(bucket: string, prefix: string) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !data) return
  for (const object of data) {
    const path = `${prefix}/${object.name}`
    if (object.id) await admin.storage.from(bucket).remove([path])
    else await removeTree(bucket, path)
  }
}

async function contentStep(page: Page) {
  const nav = page.getByTestId('lesson-steps').filter({ visible: true })
  await expect.poll(async () => {
    await nav.getByRole('button').nth(1).evaluate((button: HTMLButtonElement) => button.click())
    return page.locator('[data-tour="lesson-editor-mode"]').isVisible()
  }, { timeout: 30_000 }).toBe(true)
  await expect(page.locator('[data-tour="lesson-editor-mode"]')).toBeVisible()
}

async function upload(page: Page, field: string, filename: string, mimeType: string, buffer: Buffer) {
  const scope = page.locator(`[data-upload-field="${field}"]`).first()
  const value = scope.locator('input:not([type=file])').first()
  await expect.poll(() => value.evaluate((input) => Object.keys(input).some((key) => key.startsWith('__reactProps'))), { timeout: 30_000 }).toBe(true)
  await scope.locator('input[type=file]').setInputFiles({ name: filename, mimeType, buffer })
  await expect.poll(() => value.inputValue(), { timeout: 30_000 }).toMatch(/^(lesson-resource:\/\/|https?:\/\/)/)
  await expect(scope.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled()
  return value.inputValue()
}

test.describe('authenticated upload and private media flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)

  test.beforeAll(async () => {
    admin = localAdmin()
    const { error: tenantError } = await admin.from('tenants').insert({
      id: tenant.id, slug: tenant.slug, name: tenant.name, plan: 'business', status: 'active', billing_status: 'free',
    })
    expect(tenantError).toBeNull()
    for (const role of ['student', 'teacher', 'admin'] as const) {
      const account = accounts[role]
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email, password: account.password, email_confirm: true,
        app_metadata: { tenant_id: tenant.id }, user_metadata: { preferred_tenant_id: tenant.id },
      })
      expect(error).toBeNull()
      account.id = data.user!.id
      expect((await admin.from('tenant_users').upsert({ tenant_id: tenant.id, user_id: account.id, role, status: 'active' }, { onConflict: 'tenant_id,user_id' })).error).toBeNull()
      expect((await admin.from('profiles').update({ onboarding_completed: true }).eq('id', account.id)).error).toBeNull()
    }
    const course = await admin.from('courses').insert({ title: courseTitle, description: 'Local E2E upload fixture', status: 'published', author_id: accounts.teacher.id, tenant_id: tenant.id }).select('course_id').single()
    expect(course.error).toBeNull(); courseId = course.data!.course_id
    const lesson = await admin.from('lessons').insert({ title: lessonTitle, content: '# Upload lesson', course_id: courseId, sequence: 1, status: 'published', tenant_id: tenant.id }).select('id').single()
    expect(lesson.error).toBeNull(); lessonId = lesson.data!.id
    expect((await admin.from('entitlements').insert({ user_id: accounts.student.id, tenant_id: tenant.id, course_id: courseId, source_type: 'free', status: 'active' })).error).toBeNull()
    expect((await admin.from('enrollments').insert({ user_id: accounts.student.id, tenant_id: tenant.id, course_id: courseId, status: 'active' })).error).toBeNull()
    // An old Vocabulary audio= lesson must survive a visual editor save unchanged.
    const legacyPath = `${tenant.id}/${lessonId}/legacy-${run}.wav`
    expect((await admin.storage.from('lesson-resources').upload(legacyPath, wav(), { contentType: 'audio/wav' })).error).toBeNull()
    const legacy = await admin.from('lesson_resources').insert({ lesson_id: lessonId, tenant_id: tenant.id, file_path: legacyPath, file_name: 'legacy.wav', file_size: wav().length, mime_type: 'audio/wav', display_order: 0 }).select('id').single()
    expect(legacy.error).toBeNull()
    legacyReference = `lesson-resource://${lessonId}/${legacy.data!.id}`
    const content = `<Audio src="" title="Uploaded audio" />\n\n<Vocabulary word="current" translation="current" />\n\n<Vocabulary word="legacy" translation="legacy" audio="${legacyReference}" />\n\n<FileDownload url="" filename="worksheet.pdf" />`
    expect((await admin.from('lessons').update({ content }).eq('id', lessonId)).error).toBeNull()
  })

  test.afterAll(async () => {
    if (!admin) return
    for (const bucket of ['lesson-resources', 'landing-page-assets', 'course-images']) await removeTree(bucket, tenant.id)
    for (const account of Object.values(accounts)) if (account.id) await removeTree('avatars', account.id)
    await destroyQaTenant(admin, tenant)
    for (const account of Object.values(accounts)) if (account.id) await admin.auth.admin.deleteUser(account.id)
  })

  test('unsaved lessons explain why private media upload is disabled', async ({ page }) => {
    await login(page, accounts.teacher.email, accounts.teacher.password, school)
    await page.goto(`${school}/dashboard/teacher/courses/${courseId}/lessons/new`)
    await contentStep(page)
    for (const { choice, field } of [
      { choice: /^Audio\b/, field: 'Audio file' },
      { choice: /^Vocabulary\b/, field: 'Vocabulary audio' },
      { choice: /^File\b/, field: 'Lesson file' },
    ]) {
      await page.getByRole('button', { name: /^add block$/i }).first().click()
      await page.getByRole('button', { name: choice }).click()
      const scope = page.locator(`[data-upload-field="${field}"]`).first()
      await expect(scope.locator('input[type=file]')).toBeDisabled()
      await expect(scope.getByText('Save the lesson before uploading media.')).toBeVisible()
    }
  })

  test('an actual teacher edits their own lesson and uploads audio, vocabulary audio and a file', async ({ page }) => {
    await login(page, accounts.teacher.email, accounts.teacher.password, school)
    await expect(page).toHaveURL(`${school}/dashboard/teacher`)
    await page.goto(`${school}/dashboard/teacher/courses/${courseId}/lessons/${lessonId}`)
    await contentStep(page)
    await upload(page, 'Audio file', 'voice.wav', 'audio/wav', wav())
    await upload(page, 'Vocabulary audio', 'word.wav', 'audio/wav', wav())
    await upload(page, 'Lesson file', 'worksheet.pdf', 'application/pdf', tinyPdf())
    await page.getByRole('button', { name: /^publish$/i }).filter({ visible: true }).first().click()
    await expect(page).toHaveURL(`${school}/dashboard/teacher/courses/${courseId}`, { timeout: 30_000 })
    const { data, error } = await admin.from('lessons').select('content').eq('id', lessonId).single()
    expect(error).toBeNull()
    expect(data!.content.match(/lesson-resource:\/\/\d+\/\d+/g)).toHaveLength(4)
    expect(data!.content).toContain(`audio="${legacyReference}"`)
    expect(data!.content).not.toContain('token=')
    expect(data!.content).not.toContain('/resources/')
    await page.goto(`${school}/dashboard/teacher/courses/${courseId}/lessons/${lessonId}`)
    await contentStep(page)
    await expect(page.locator('[data-upload-field="Audio file"] input').first()).toHaveValue(/^lesson-resource:\/\//)
  })

  test('a student plays private audio, downloads the file and renews signed URLs', async ({ page }) => {
    await login(page, accounts.student.email, accounts.student.password, school)
    await page.clock.install()
    let signerCalls = 0
    let signedResponse = 0
    await page.route(`**/api/lessons/${lessonId}/resources/*/url`, async (route) => {
      // The viewer aborts an in-flight renewal when it re-renders or the page
      // reloads; that disposes the response mid-read, which is not a failure.
      try {
        const response = await route.fetch()
        if (!response.ok()) { await route.fulfill({ response }); return }
        const body = await response.json()
        // Keep the real authorized token/bytes, but force src rotation even when
        // the real server signs twice within the same wall-clock second.
        const url = new URL(body.url)
        url.searchParams.set('qa-refresh', String(++signedResponse))
        await route.fulfill({ response, json: { ...body, url: url.href } })
      } catch (error) {
        if (!/disposed|has been closed/i.test(String(error))) throw error
        await route.abort().catch(() => undefined)
      }
    })
    page.on('response', (response) => { if (response.url().includes(`/api/lessons/${lessonId}/resources/`) && response.ok()) signerCalls++ })
    await page.goto(`${school}/dashboard/student/courses/${courseId}/lessons/${lessonId}`)
    const audio = page.locator('audio[controls]').first()
    await expect(audio).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/lesson-resources\//, { timeout: 30_000 })
    const source = await audio.getAttribute('src')
    expect(source).not.toContain('/api/lessons/')
    expect((await page.request.get(source!)).status()).toBe(200)
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0)
    await audio.evaluate(async (element: HTMLAudioElement) => { element.currentTime = 2; await element.play() })
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(2)
    const download = page.getByRole('link', { name: 'Download', exact: true })
    await expect(download).toHaveAttribute('href', /\/storage\/v1\/object\/sign\/lesson-resources\//)
    expect((await page.request.get((await download.getAttribute('href'))!)).status()).toBe(200)
    const callsBefore = signerCalls
    // Time is advanced only in the browser; every renewal still calls the real authenticated app and Storage API.
    await page.clock.fastForward(271_000)
    await expect.poll(() => signerCalls).toBeGreaterThan(callsBefore)
    await expect(audio).not.toHaveAttribute('src', source!)
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false)
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(2)
    expect((await page.request.get((await audio.getAttribute('src'))!)).status()).toBe(200)
    await audio.evaluate((element: HTMLAudioElement) => { element.pause(); element.currentTime = 3 })
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeCloseTo(3, 1)
    const pausedSource = await audio.getAttribute('src')
    await page.clock.fastForward(271_000)
    await expect(audio).not.toHaveAttribute('src', pausedSource!)
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeCloseTo(3, 1)
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
    await page.reload()
    await expect(audio).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/lesson-resources\//)
    await expect(page.locator('audio')).toHaveCount(3)
  })

  for (const role of ['student', 'teacher'] as const) {
    test(`${role} profile photo is saved by the upload and survives reload`, async ({ page }) => {
      await login(page, accounts[role].email, accounts[role].password, school)
      await page.goto(`${school}/dashboard/${role === 'student' ? 'student/profile' : 'settings'}`)
      const url = await upload(page, 'Profile photo', `${role}.png`, 'image/png', noisePng(24))
      await expect(page.getByAltText('Profile photo preview')).toBeVisible()
      const profile = await admin.from('profiles').select('avatar_url').eq('id', accounts[role].id).single()
      expect(profile.error).toBeNull(); expect(profile.data!.avatar_url).toBe(url)
      await page.reload()
      await expect(page.getByAltText('Profile photo preview')).toHaveAttribute('src', url)
      expect((await page.request.get(url)).status()).toBe(200)
    })
  }

  test('an admin uploads and saves both branding images', async ({ page }) => {
    await login(page, accounts.admin.email, accounts.admin.password, school)
    await page.goto(`${school}/dashboard/admin/appearance`)
    const logo = await upload(page, 'logo_url', 'logo.png', 'image/png', noisePng(24))
    const favicon = await upload(page, 'favicon_url', 'favicon.png', 'image/png', noisePng(24, 2))
    const form = page.locator('form').filter({ has: page.locator('#logo_url') })
    await form.getByRole('button', { name: /save changes/i }).click()
    await expect.poll(async () => {
      const { data } = await admin.from('tenant_settings').select('setting_key,setting_value').eq('tenant_id', tenant.id).in('setting_key', ['logo_url', 'favicon_url'])
      return Object.fromEntries((data ?? []).map((setting) => [setting.setting_key, setting.setting_value.value]))
    }).toEqual({ logo_url: logo, favicon_url: favicon })
    await page.reload()
    await expect(page.locator('#logo_url')).toHaveValue(logo)
    await expect(page.locator('#favicon_url')).toHaveValue(favicon)
  })

  test('the product wizard uploads a course thumbnail and keeps its preview between steps', async ({ page }) => {
    await login(page, accounts.admin.email, accounts.admin.password, school)
    await page.goto(`${school}/dashboard/admin/products/new`)
    await page.getByTestId('course-source-new').click()
    await page.getByTestId('product-creation-next').click()
    await page.getByTestId('product-creation-title').fill(`Thumbnail course ${run}`)
    const thumbnail = await upload(page, 'Course thumbnail', 'thumbnail.png', 'image/png', noisePng(24, 3))
    await expect(page.getByAltText('Course thumbnail preview')).toHaveAttribute('src', thumbnail)
    await page.getByTestId('product-creation-next').click()
    await page.getByRole('button', { name: /^back$/i }).click()
    await expect(page.getByAltText('Course thumbnail preview')).toHaveAttribute('src', thumbnail)
    expect((await page.request.get(thumbnail)).status()).toBe(200)
  })
})
