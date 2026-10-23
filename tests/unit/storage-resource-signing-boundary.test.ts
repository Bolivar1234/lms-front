import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signLessonResourceDownload } from '@/lib/lessons/resource-download'

function fixture(path: string) {
  const signed = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.test/resource?token=valid' }, error: null })
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
  const resource = { id: 1, file_path: path, file_name: 'Lesson.pdf', mime_type: 'application/pdf', lesson_id: 7, tenant_id: 'tenant-a', lessons: { course_id: 3, courses: { author_id: 'teacher-a' } } }
  const admin = {
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'lesson_resources' ? resource : null, error: null }) }
      return query
    },
    rpc, storage: { from: () => ({ createSignedUrl: signed }) },
  } as unknown as SupabaseClient
  return { admin, signed, rpc }
}

describe('private resource storage identity binding', () => {
  it.each(['tenant-b/7/file.pdf', 'tenant-a/8/file.pdf', 'tenant-a/7/../8/file.pdf', 'tenant-a/7/%2fother.pdf'])('does not sign a forged resource row pointing at %s', async (path) => {
    const { admin, signed, rpc } = fixture(path)
    expect(await signLessonResourceDownload(admin, { tenantId: 'tenant-a', userId: 'student-a', lessonId: 7, resourceId: 1 })).toEqual({ ok: false, code: 'not_found' })
    expect(signed).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('preserves authorized student access to a same-tenant same-lesson resource', async () => {
    const { admin, signed } = fixture('tenant-a/7/file.pdf')
    expect((await signLessonResourceDownload(admin, { tenantId: 'tenant-a', userId: 'student-a', lessonId: 7, resourceId: 1 })).ok).toBe(true)
    expect(signed).toHaveBeenCalledWith('tenant-a/7/file.pdf', 300)
  })
})
