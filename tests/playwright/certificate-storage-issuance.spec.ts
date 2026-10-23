import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './utils/test'
import { login } from './utils/auth'
import { BASE } from './utils/constants'
import { destroyQaTenant } from './utils/plan-gate-fixtures'
import { encryptPrivateKey, generateIssuerKeyPair } from '../../lib/certificates/crypto'

// This covers the signed admin-initiated pipeline. Ordinary student self-serve
// currently cannot read issuer_keys through its session and falls back to the
// existing simplified pipeline; a row from that path is not a passing result.
const run = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
const tenant = { id: randomUUID(), slug: `qa-cert-storage-${run}`, name: `Certificate Storage QA ${run}`, planSlug: `unused-${run}` }
const school = BASE.replace('://', `://${tenant.slug}.`)
const courseTitle = `Signed storage certificate ${run}`
const lessonTitle = `Complete this certificate lesson ${run}`
const issuerKeyId = randomUUID()
const issuerKeyUrl = `${school}/api/issuer-keys/${issuerKeyId}`
const accounts = {
  student: { id: '', email: `qa-cert-student-${run}@e2etest.com`, password: 'password123' },
  admin: { id: '', email: `qa-cert-admin-${run}@e2etest.com`, password: 'password123' },
}
let admin: SupabaseClient
let courseId = 0
let lessonId = 0

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('Certificate storage fixtures require a disposable local Supabase target.')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.CERTIFICATE_ENCRYPTION_KEY) {
    throw new Error('Local service-role and synthetic certificate encryption configuration are required.')
  }
  if (process.env.RESEND_API_KEY || process.env.MAILGUN_API_KEY) {
    throw new Error('Certificate storage regression requires external email providers to be disabled.')
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

test.describe('signed certificate Storage compatibility', () => {
  test.setTimeout(180_000)

  test.beforeAll(async () => {
    admin = localAdmin()
    // The issuer currently selects one active global key. Never disable or
    // replace another test's key to force this fixture through that contract.
    const keys = await admin.from('issuer_keys').select('key_id').eq('is_active', true).is('revoked_at', null)
    expect(keys.error).toBeNull()
    expect(keys.data, 'Run this isolated fixture without another active issuer key.').toEqual([])
    expect((await admin.from('tenants').insert({ id: tenant.id, slug: tenant.slug, name: tenant.name, plan: 'business', status: 'active', billing_status: 'free' })).error).toBeNull()
    for (const role of ['student', 'admin'] as const) {
      const account = accounts[role]
      const created = await admin.auth.admin.createUser({
        email: account.email, password: account.password, email_confirm: true,
        app_metadata: { tenant_id: tenant.id }, user_metadata: { preferred_tenant_id: tenant.id, full_name: `Certificate QA ${role}` },
      })
      expect(created.error).toBeNull()
      account.id = created.data.user!.id
      expect((await admin.from('tenant_users').upsert({ tenant_id: tenant.id, user_id: account.id, role, status: 'active' }, { onConflict: 'tenant_id,user_id' })).error).toBeNull()
      expect((await admin.from('profiles').update({ onboarding_completed: true }).eq('id', account.id)).error).toBeNull()
    }
    // This is a real school administrator, matching the existing issuer-key RLS.
    expect((await admin.from('user_roles').insert({ user_id: accounts.admin.id, role: 'admin' })).error).toBeNull()
    const course = await admin.from('courses').insert({ title: courseTitle, description: 'Disposable signed-certificate Storage regression', status: 'published', author_id: accounts.admin.id, tenant_id: tenant.id }).select('course_id').single()
    expect(course.error).toBeNull(); courseId = course.data!.course_id
    const lesson = await admin.from('lessons').insert({ title: lessonTitle, content: '# Complete this local fixture lesson', course_id: courseId, sequence: 1, status: 'published', tenant_id: tenant.id }).select('id').single()
    expect(lesson.error).toBeNull(); lessonId = lesson.data!.id
    expect((await admin.from('entitlements').insert({ user_id: accounts.student.id, tenant_id: tenant.id, course_id: courseId, source_type: 'free', status: 'active' })).error).toBeNull()
    expect((await admin.from('enrollments').insert({ user_id: accounts.student.id, tenant_id: tenant.id, course_id: courseId, status: 'active' })).error).toBeNull()
  })

  test.afterAll(async () => {
    if (!admin) return
    const certificates = await admin.from('certificates').select('certificate_id').eq('tenant_id', tenant.id)
    expect(certificates.error).toBeNull()
    const paths = (certificates.data ?? []).flatMap((certificate) => [`pdfs/${certificate.certificate_id}.pdf`, `badges/${certificate.certificate_id}.png`])
    if (paths.length) expect((await admin.storage.from('certificates').remove(paths)).error).toBeNull()
    expect((await admin.from('certificates').delete().eq('tenant_id', tenant.id)).error).toBeNull()
    expect((await admin.from('issuer_keys').delete().eq('key_id', issuerKeyId)).error).toBeNull()
    // Completion creates gamification and community records whose tenant FKs
    // do not cascade. Delete only our users first: their profile FKs cascade
    // those records, allowing the tenant helper's final delete to succeed.
    for (const account of Object.values(accounts)) {
      if (account.id) expect((await admin.auth.admin.deleteUser(account.id)).error).toBeNull()
    }
    await destroyQaTenant(admin, tenant)
    const remainingTenant = await admin.from('tenants').select('id').eq('id', tenant.id).maybeSingle()
    expect(remainingTenant.error).toBeNull(); expect(remainingTenant.data).toBeNull()
  })

  test('real student completion followed by supported admin issuance creates signed PDF and badge objects', async ({ page, browser }) => {
    await login(page, accounts.student.email, accounts.student.password, school)
    expect(new URL(page.url()).origin).toBe(new URL(school).origin)
    expect(new URL(page.url()).pathname).toBe('/dashboard/student')
    await page.goto(`${school}/dashboard/student/courses/${courseId}/lessons/${lessonId}`)
    await expect(page.getByText(lessonTitle, { exact: true }).first()).toBeVisible()
    const complete = page.getByTestId('lesson-complete-toggle').filter({ visible: true }).first()
    await expect(complete).toBeEnabled()
    await expect.poll(() => complete.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps')))).toBe(true)
    await complete.click()
    await expect.poll(async () => {
      const completion = await admin.from('lesson_completions').select('user_id').eq('lesson_id', lessonId).eq('user_id', accounts.student.id).maybeSingle()
      expect(completion.error).toBeNull()
      return completion.data?.user_id
    }, { timeout: 30_000 }).toBe(accounts.student.id)
    const before = await admin.from('certificates').select('certificate_id').eq('course_id', courseId).eq('user_id', accounts.student.id)
    expect(before.error).toBeNull(); expect(before.data).toEqual([])

    // Configuring a certificate after a student completed a course is a normal
    // teacher workflow and avoids the DB auto-issuance row-only trigger.
    expect((await admin.from('certificate_templates').insert({
      tenant_id: tenant.id, course_id: courseId, created_by: accounts.admin.id,
      template_name: `Storage certificate ${run}`, issuer_name: tenant.name, issuer_url: school,
      description: 'Completed the local certificate storage fixture', issuance_criteria: 'Complete the one published lesson',
      min_lesson_completion_pct: 100, min_exam_pass_score: 70, requires_all_exams: false, is_active: true,
    })).error).toBeNull()
    const keyPair = generateIssuerKeyPair()
    const encrypted = encryptPrivateKey(keyPair.privateKey, process.env.CERTIFICATE_ENCRYPTION_KEY!)
    expect((await admin.from('issuer_keys').insert({
      key_id: issuerKeyId, key_name: `Disposable certificate Storage key ${run}`, key_type: 'Ed25519',
      key_url: issuerKeyUrl, public_key: keyPair.publicKey, public_key_multibase: keyPair.publicKeyMultibase,
      public_key_jwk: { ...keyPair.publicKeyJwk }, private_key_encrypted: encrypted, is_active: true,
    })).error).toBeNull()
    const eligibility = await admin.rpc('calculate_course_completion', { p_user_id: accounts.student.id, p_course_id: courseId })
    expect(eligibility.error).toBeNull()
    expect(eligibility.data).toMatchObject({ eligible: true, completedLessons: 1, totalLessons: 1, completionPercentage: 100 })

    const issuerContext = await browser.newContext()
    try {
      const issuerPage = await issuerContext.newPage()
      await login(issuerPage, accounts.admin.email, accounts.admin.password, school)
      // Actual authenticated browser request into the supported app endpoint;
      // fixture setup never uploads certificate bytes or inserts the result row.
      const result = await issuerPage.evaluate(async ({ courseId, studentId }) => {
        const response = await fetch('/api/certificates/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, userId: studentId }) })
        return { status: response.status, body: await response.json() as { success?: boolean; certificateId?: string; error?: string; reason?: string } }
      }, { courseId, studentId: accounts.student.id })
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      expect(result.body.success, JSON.stringify(result.body)).toBe(true)
      expect(result.body.certificateId).toMatch(/^[0-9a-f-]{36}$/i)
      const certificate = await admin.from('certificates').select('certificate_id, user_id, course_id, tenant_id, credential_json, pdf_url, badge_image_url').eq('certificate_id', result.body.certificateId!).single()
      expect(certificate.error).toBeNull()
      expect(certificate.data).toMatchObject({ user_id: accounts.student.id, course_id: courseId, tenant_id: tenant.id })
      expect(certificate.data!.credential_json).toMatchObject({ proof: { verificationMethod: issuerKeyUrl } })
      const expectedPaths = { pdf_url: `pdfs/${result.body.certificateId}.pdf`, badge_image_url: `badges/${result.body.certificateId}.png` }
      for (const field of ['pdf_url', 'badge_image_url'] as const) {
        const storedUrl = certificate.data![field]
        expect(storedUrl).toBeTruthy()
        const url = new URL(storedUrl!)
        expect(url.origin).toBe(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin)
        expect(url.pathname).toBe(`/storage/v1/object/public/certificates/${expectedPaths[field]}`)
        const downloaded = await admin.storage.from('certificates').download(expectedPaths[field])
        expect(downloaded.error).toBeNull()
        expect(downloaded.data!.size).toBeGreaterThan(1000)
        const response = await page.request.get(storedUrl!)
        expect(response.status()).toBe(200)
        const bytes = await response.body()
        expect(bytes.length).toBe(downloaded.data!.size)
        if (field === 'pdf_url') {
          expect(response.headers()['content-type']).toContain('application/pdf')
          expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
        } else {
          expect(response.headers()['content-type']).toContain('image/png')
          expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
          expect(bytes.readUInt32BE(16)).toBe(400)
          expect(bytes.readUInt32BE(20)).toBe(400)
        }
      }
    } finally {
      await issuerContext.close()
    }
  })
})
