import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { createFakeSupabase, type Db } from './support/fake-supabase'

const state = vi.hoisted(() => ({
  userId: 'user-a' as string | null,
  tenantId: 'tenant-a',
  database: {} as Db,
  uploads: [] as { bucket: string; path: string; mime: string }[],
  removes: [] as string[],
  failUpload: false,
  failResource: false,
  failProfile: false,
}))

function client() {
  const fake = createFakeSupabase(state.database, { failWrites: (table) => (
    (table === 'lesson_resources' && state.failResource) || (table === 'profiles' && state.failProfile)
      ? { code: '42501', message: 'test write refusal' } : null
  ) })
  return {
    ...fake.client,
    from: (table: string) => {
      const query = fake.client.from(table)
      if (table === 'lesson_resources') {
        const insert = query.insert as (row: Record<string, unknown>) => unknown
        query.insert = (row: Record<string, unknown>) => insert({ ...row, id: 42 })
      }
      return query
    },
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null }, error: null }) },
    storage: { from: (bucket: string) => ({
      upload: async (path: string, _bytes: Buffer, opts: { contentType: string }) => {
        state.uploads.push({ bucket, path, mime: opts.contentType })
        return { data: null, error: state.failUpload ? new Error('storage failed') : null }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/storage/v1/object/public/${bucket}/${path}` } }),
      remove: async (paths: string[]) => { state.removes.push(...paths); return { error: null } },
    }) },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: async () => state.tenantId }))

import { uploadScopedAsset } from '@/app/actions/storage'
import { deleteLandingPageAsset } from '@/app/actions/admin/landing-page-assets'

async function form() {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }).png().toBuffer()
  const data = new FormData()
  data.set('file', new File([new Uint8Array(bytes)], 'attack.html', { type: 'text/html' }))
  data.set('tenantId', 'tenant-b'); data.set('path', 'tenant-b/stolen.svg')
  return data
}

beforeEach(() => {
  state.userId = 'user-a'; state.tenantId = 'tenant-a'
  state.failUpload = false; state.failResource = false; state.failProfile = false
  state.uploads = []; state.removes = []
  state.database = {
    tenant_users: [{ tenant_id: 'tenant-a', user_id: 'user-a', role: 'admin', status: 'active' }],
    courses: [{ course_id: 3, tenant_id: 'tenant-a', author_id: 'user-a' }],
    lessons: [{ id: 7, course_id: 3, tenant_id: 'tenant-a' }],
    lesson_resources: [], profiles: [{ id: 'user-a', avatar_url: null }, { id: 'user-b', avatar_url: null }],
  }
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.test')
})

describe('trusted scoped uploads', () => {
  it('rejects unauthenticated callers before any upload', async () => {
    state.userId = null
    expect((await uploadScopedAsset({ purpose: 'course-image' }, await form())).success).toBe(false)
    expect(state.uploads).toEqual([])
  })
  it.each(['missing', 'inactive', 'student'])('rejects %s tenant authority without JWT-role fallback', async (kind) => {
    if (kind === 'missing') state.database.tenant_users = []
    if (kind === 'inactive') state.database.tenant_users[0].status = 'inactive'
    if (kind === 'student') state.database.tenant_users[0].role = 'student'
    expect((await uploadScopedAsset({ purpose: 'course-image' }, await form())).success).toBe(false)
    expect(state.uploads).toEqual([])
  })
  it('ignores client-selected tenant/path and stores canonical validated raster bytes', async () => {
    const result = await uploadScopedAsset({ purpose: 'landing-image' }, await form())
    expect(result.success).toBe(true)
    expect(state.uploads[0]).toMatchObject({ bucket: 'landing-page-assets', mime: 'image/webp' })
    expect(state.uploads[0].path).toMatch(/^tenant-a\/images\/[A-Za-z0-9_-]+\.webp$/)
  })
  it('rejects teachers touching another author course or admin-only branding', async () => {
    state.database.tenant_users[0].role = 'teacher'; state.database.courses[0].author_id = 'user-b'
    expect((await uploadScopedAsset({ purpose: 'course-image', courseId: 3 }, await form())).success).toBe(false)
    expect((await uploadScopedAsset({ purpose: 'landing-image' }, await form())).success).toBe(false)
    expect((await uploadScopedAsset({ purpose: 'lesson-image', lessonId: 7 }, await form())).success).toBe(false)
    expect(state.uploads).toEqual([])
  })
  it('requires a saved same-tenant lesson and validates the supplied course scope', async () => {
    expect((await uploadScopedAsset({ purpose: 'lesson-image', lessonId: 0 }, await form())).success).toBe(false)
    state.database.lessons[0].tenant_id = 'tenant-b'
    expect((await uploadScopedAsset({ purpose: 'lesson-image', lessonId: 7 }, await form())).success).toBe(false)
    state.database.lessons[0].tenant_id = 'tenant-a'
    expect((await uploadScopedAsset({ purpose: 'lesson-image', lessonId: 7, courseId: 999 }, await form())).success).toBe(false)
    expect(state.uploads).toEqual([])
  })
  it('cleans up storage when resource persistence fails', async () => {
    state.failResource = true
    expect((await uploadScopedAsset({ purpose: 'lesson-image', lessonId: 7 }, await form())).success).toBe(false)
    expect(state.removes).toEqual([state.uploads[0].path])
  })
  it('persists a private resource identity without generating a public or signed URL', async () => {
    const result = await uploadScopedAsset({ purpose: 'lesson-image', lessonId: 7 }, await form())
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toMatchObject({ url: 'lesson-resource://7/42', reference: 'lesson-resource://7/42', resourceId: 42, lessonId: 7, bucket: 'lesson-resources' })
    expect(state.uploads[0].path).toMatch(/^tenant-a\/7\//)
    expect(state.database.lesson_resources[0]).toMatchObject({ tenant_id: 'tenant-a', lesson_id: 7, uploaded_by: 'user-a', file_path: state.uploads[0].path })
  })
  it('does not return a public fallback on storage failure', async () => {
    state.failUpload = true
    expect(await uploadScopedAsset({ purpose: 'landing-image' }, await form())).toEqual({ success: false, error: 'Failed to upload image' })
  })
  it('updates only the authenticated global profile, independent of tenant membership', async () => {
    state.database.tenant_users = []
    const result = await uploadScopedAsset({ purpose: 'avatar' }, await form())
    expect(result.success).toBe(true)
    expect(state.uploads[0].path).toMatch(/^user-a\//)
    expect(state.database.profiles[0].avatar_url).toContain('/avatars/user-a/')
    expect(state.database.profiles[1].avatar_url).toBe(null)
  })
  it('removes an uploaded avatar when saving the own profile fails', async () => {
    state.failProfile = true
    expect((await uploadScopedAsset({ purpose: 'avatar' }, await form())).success).toBe(false)
    expect(state.removes).toEqual([state.uploads[0].path])
  })
  it('only deletes landing assets with the configured storage origin and tenant prefix', async () => {
    for (const value of ['https://evil.test/landing-page-assets/tenant-a/a.webp', 'https://storage.test/storage/v1/object/public/landing-page-assets/tenant-b/a.webp', 'https://storage.test/storage/v1/object/public/landing-page-assets/tenant-a/%252e%252e/a.webp']) {
      expect((await deleteLandingPageAsset(value)).success).toBe(false)
    }
    expect(state.removes).toEqual([])
    expect((await deleteLandingPageAsset('https://storage.test/storage/v1/object/public/landing-page-assets/tenant-a/a.webp')).success).toBe(true)
    expect(state.removes).toEqual(['tenant-a/a.webp'])
  })
})
