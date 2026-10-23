/**
 * Sign a lesson resource for download (#848) — the one gate both the web
 * action (`getResourceDownloadUrl`) and the native app's
 * `GET /api/lessons/:lessonId/resources/:resourceId/url` go through.
 *
 * Files live in the private `lesson-resources` bucket and are signed with the
 * service role, so this function IS the access check: the resource must belong
 * to `tenantId` (and to `lessonId`, when the caller names one), and the caller
 * must be the course's author, an active admin of the school, or hold course
 * access (`has_course_access` — entitlement + the school's access cutoff).
 * Anything else looks like a missing resource or a refusal, never a URL.
 *
 * One exception, for anyone including a logged-out visitor: media embedded in a
 * public free-preview lesson. The public preview page renders that lesson's
 * content to everyone, so the files its content references are signed under the
 * same guards the page uses (preview switch on, course and lesson published,
 * lesson marked preview). Other files of that lesson stay private.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasCourseAccess } from '@/lib/services/course-access'
import { FREE_PREVIEW_SETTING_KEY } from '@/lib/settings/free-preview'
import { isScopedLessonResourcePath, lessonResourceReference } from '@/lib/storage/references'

/** Seconds a signed URL stays valid. Callers open it right away. */
export const RESOURCE_URL_TTL_SECONDS = 300

export type ResourceDownloadResult =
  | { ok: true; url: string; expiresIn: number; fileName: string; mimeType: string | null }
  | { ok: false; code: 'not_found' | 'access_denied' | 'failed' }

interface ResourceRow {
  id: number
  file_path: string
  file_name: string
  mime_type: string | null
  lesson_id: number
  tenant_id: string
  lessons: { course_id: number; courses: { author_id: string | null } | null } | null
}

export async function signLessonResourceDownload(
  admin: SupabaseClient,
  {
    tenantId,
    userId,
    resourceId,
    lessonId,
  }: { tenantId: string; userId: string | null; resourceId: number; lessonId?: number }
): Promise<ResourceDownloadResult> {
  const { data, error } = await admin
    .from('lesson_resources')
    .select('id, file_path, file_name, mime_type, lesson_id, tenant_id, lessons(course_id, courses(author_id))')
    .eq('id', resourceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('Lesson resource lookup failed:', error)
    return { ok: false, code: 'failed' }
  }

  const resource = data as unknown as ResourceRow | null
  // Belt and braces on the tenant: the filter above already scopes it.
  if (!resource || resource.tenant_id !== tenantId) return { ok: false, code: 'not_found' }
  if (lessonId !== undefined && resource.lesson_id !== lessonId) return { ok: false, code: 'not_found' }
  if (!isScopedLessonResourcePath(resource.file_path, tenantId, resource.lesson_id)) return { ok: false, code: 'not_found' }

  const courseId = resource.lessons?.course_id
  if (!courseId) return { ok: false, code: 'not_found' }

  const allowed =
    (userId !== null &&
      (await canDownload(admin, { tenantId, userId, courseId, authorId: resource.lessons?.courses?.author_id }))) ||
    (await isPublicPreviewMedia(admin, { tenantId, lessonId: resource.lesson_id, resourceId: resource.id }))
  if (!allowed) return { ok: false, code: 'access_denied' }

  const { data: signed, error: signError } = await admin.storage
    .from('lesson-resources')
    .createSignedUrl(resource.file_path, RESOURCE_URL_TTL_SECONDS)
  if (signError || !signed?.signedUrl) {
    console.error('Lesson resource signing failed:', signError)
    return { ok: false, code: 'failed' }
  }

  return {
    ok: true,
    url: signed.signedUrl,
    expiresIn: RESOURCE_URL_TTL_SECONDS,
    fileName: resource.file_name,
    mimeType: resource.mime_type,
  }
}

async function canDownload(
  admin: SupabaseClient,
  {
    tenantId,
    userId,
    courseId,
    authorId,
  }: { tenantId: string; userId: string; courseId: number; authorId: string | null | undefined }
): Promise<boolean> {
  if (authorId && authorId === userId) return true

  // `tenant_users` is authoritative for the role (CLAUDE.md), not a JWT claim.
  const { data: adminMembership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'admin')
    .maybeSingle()
  if (adminMembership) return true

  return hasCourseAccess(admin, userId, courseId)
}

/**
 * True when `resourceId` is embedded in the content of a lesson the public
 * preview page would show: the same guards as
 * `app/[locale]/(public)/courses/[id]/lessons/[lessonId]/page.tsx`.
 */
async function isPublicPreviewMedia(
  admin: SupabaseClient,
  { tenantId, lessonId, resourceId }: { tenantId: string; lessonId: number; resourceId: number }
): Promise<boolean> {
  // Same rule as `isFreePreviewEnabled`: only an explicit `enabled: false` turns previews off.
  const { data: setting } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', FREE_PREVIEW_SETTING_KEY)
    .maybeSingle()
  if ((setting?.setting_value as { enabled?: boolean } | null)?.enabled === false) return false
  const { data } = await admin
    .from('lessons')
    .select('content, courses(status)')
    .eq('id', lessonId)
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .eq('is_preview', true)
    .maybeSingle()
  const lesson = data as unknown as { content: string | null; courses: { status: string | null } | null } | null
  if (!lesson || lesson.courses?.status !== 'published' || !lesson.content) return false
  // `lesson-resource://5/1` must not match inside `lesson-resource://5/12`.
  const reference = lessonResourceReference(lessonId, resourceId)
  let from = 0
  for (;;) {
    const at = lesson.content.indexOf(reference, from)
    if (at < 0) return false
    if (!/\d/.test(lesson.content.charAt(at + reference.length))) return true
    from = at + reference.length
  }
}
