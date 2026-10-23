import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export async function getStorageActor() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')
  return { supabase, user, admin: createAdminClient() }
}

export async function authorizeTenantStorage() {
  const actor = await getStorageActor()
  const tenantId = await getCurrentTenantId()
  const { data: membership, error } = await actor.admin.from('tenant_users')
    .select('role').eq('tenant_id', tenantId).eq('user_id', actor.user.id).eq('status', 'active').maybeSingle()
  if (error || !membership || !['student', 'teacher', 'admin'].includes(membership.role)) throw new Error('Access denied')
  return { ...actor, tenantId, role: membership.role as 'student' | 'teacher' | 'admin' }
}

export async function authorizeCourseStorage(courseId?: number, adminOnly = false) {
  const actor = await authorizeTenantStorage()
  if (actor.role !== 'admin' && (adminOnly || actor.role !== 'teacher')) throw new Error('Access denied')
  if (courseId !== undefined) {
    if (!Number.isSafeInteger(courseId) || courseId <= 0) throw new Error('Invalid course')
    const { data: course, error } = await actor.admin.from('courses').select('course_id, author_id')
      .eq('course_id', courseId).eq('tenant_id', actor.tenantId).maybeSingle()
    if (error || !course || (actor.role !== 'admin' && course.author_id !== actor.user.id)) throw new Error('Course not found or access denied')
  }
  return actor
}

export async function authorizeLessonStorage(lessonId: number, courseId?: number) {
  if (!Number.isSafeInteger(lessonId) || lessonId <= 0) throw new Error('Save the lesson before uploading media.')
  const actor = await authorizeCourseStorage(courseId)
  const { data: lesson, error } = await actor.admin.from('lessons').select('id, course_id')
    .eq('id', lessonId).eq('tenant_id', actor.tenantId).maybeSingle()
  if (error || !lesson || (courseId !== undefined && lesson.course_id !== courseId)) throw new Error('Lesson not found')
  const { data: course, error: courseError } = await actor.admin.from('courses').select('course_id, author_id')
    .eq('course_id', lesson.course_id).eq('tenant_id', actor.tenantId).maybeSingle()
  if (courseError || !course || (actor.role !== 'admin' && course.author_id !== actor.user.id)) throw new Error('Access denied')
  return { ...actor, lessonId, courseId: lesson.course_id }
}
