'use server'

import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { signLessonResourceDownload } from '@/lib/lessons/resource-download'
import { authorizeLessonStorage } from '@/lib/storage/authorization'
import { storeLessonMedia } from '@/lib/storage/lesson-media'
import { isScopedLessonResourcePath } from '@/lib/storage/references'

async function verifyLessonOwnership(lessonId: number) {
  const actor = await authorizeLessonStorage(lessonId)
  return { userId: actor.user.id, tenantId: actor.tenantId }
}

export async function uploadLessonResource(
  lessonId: number,
  formData: FormData
): Promise<ActionResult<{ id: number; file_name: string; file_size: number; mime_type: string }>> {
  try {
    const asset = await storeLessonMedia(lessonId, formData, 'resource')
    return { success: true, data: { id: asset.resourceId!, file_name: asset.fileName, file_size: asset.size, mime_type: asset.mimeType } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to upload resource' }
  }
}

export async function deleteLessonResource(
  resourceId: number
): Promise<ActionResult> {
  try {
    const adminClient = createAdminClient()
    const tenantId = await getCurrentTenantId()
    const { data: resource, error: lookupError } = await adminClient.from('lesson_resources')
      .select('id, file_path, lesson_id, tenant_id').eq('id', resourceId).eq('tenant_id', tenantId).maybeSingle()
    if (lookupError || !resource) throw new Error('Resource not found')
    await authorizeLessonStorage(resource.lesson_id)
    if (!isScopedLessonResourcePath(resource.file_path, tenantId, resource.lesson_id)) throw new Error('Invalid resource path')
    const { error: removeError } = await adminClient.storage.from('lesson-resources').remove([resource.file_path])
    if (removeError) throw new Error('Failed to delete stored resource')

    // Remove from DB
    const { error } = await adminClient
      .from('lesson_resources')
      .delete()
      .eq('id', resourceId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete resource',
    }
  }
}

export async function reorderLessonResources(
  lessonId: number,
  orderedIds: number[]
): Promise<ActionResult> {
  try {
    const { tenantId } = await verifyLessonOwnership(lessonId)
    if (!Array.isArray(orderedIds) || !orderedIds.every((id) => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid resource order')

    const adminClient = createAdminClient()

    // Update display_order for each resource
    const updates = orderedIds.map((id, index) =>
      adminClient
        .from('lesson_resources')
        .update({ display_order: index })
        .eq('id', id)
        .eq('lesson_id', lessonId)
        .eq('tenant_id', tenantId)
    )

    const results = await Promise.all(updates)
    if (results.some((result) => result.error)) throw new Error('Failed to reorder resources')

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reorder resources',
    }
  }
}

export async function getResourceDownloadUrl(
  resourceId: number
): Promise<ActionResult<{ url: string }>> {
  try {
    const tenantId = await getCurrentTenantId()
    // Verified identity: this signs storage URLs through the admin client.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id
    if (!userId) throw new Error('Not authenticated')

    // Same gate as the app's GET /api/lessons/:id/resources/:id/url (#848).
    const result = await signLessonResourceDownload(createAdminClient(), {
      tenantId,
      userId,
      resourceId,
    })
    if (result.ok) return { success: true, data: { url: result.url } }
    return {
      success: false,
      error:
        result.code === 'not_found'
          ? 'Resource not found'
          : result.code === 'access_denied'
            ? 'Access denied'
            : 'Failed to get download URL',
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get download URL',
    }
  }
}

export async function toggleSequentialCompletion(
  courseId: number,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()
    const userId = await getCurrentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { data: course } = await supabase
      .from('courses')
      .select('course_id, author_id')
      .eq('course_id', courseId)
      .eq('tenant_id', tenantId)
      .single()

    if (!course) return { success: false, error: 'Course not found' }

    const isOwner = course.author_id === userId
    const isAdmin = role === 'admin'

    if (!isOwner && !isAdmin) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await supabase
      .from('courses')
      .update({ require_sequential_completion: enabled })
      .eq('course_id', courseId)

    if (error) throw error

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update setting',
    }
  }
}
