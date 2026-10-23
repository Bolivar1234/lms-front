import { nanoid } from 'nanoid'
import { authorizeLessonStorage } from './authorization'
import { validateUploadFile, type FileCategory } from './validation'
import { lessonResourceReference } from './references'
import type { LessonMediaPurpose, UploadedAsset } from './types'

export async function storeLessonMedia(lessonId: number, formData: FormData, purpose: LessonMediaPurpose | 'resource', courseId?: number): Promise<UploadedAsset> {
  const actor = await authorizeLessonStorage(lessonId, courseId)
  const category: FileCategory = purpose === 'lesson-audio' ? 'audio' : purpose === 'lesson-image' ? 'image' : 'document'
  const file = await validateUploadFile(formData.get('file'), category, (category === 'audio' ? 25 : category === 'image' ? 5 : 10) * 1024 * 1024)
  const bucket = 'lesson-resources'
  const path = `${actor.tenantId}/${lessonId}/${nanoid()}.${file.extension}`
  const { error: uploadError } = await actor.admin.storage.from(bucket).upload(path, file.bytes, { contentType: file.mimeType, upsert: false })
  if (uploadError) throw new Error('Failed to upload lesson media')
  try {
    const { data: existing, error: orderError } = await actor.admin.from('lesson_resources').select('display_order')
      .eq('lesson_id', lessonId).eq('tenant_id', actor.tenantId).order('display_order', { ascending: false }).limit(1)
    if (orderError) throw new Error('Failed to load lesson resources')
    const { data: resource, error } = await actor.admin.from('lesson_resources').insert({
      tenant_id: actor.tenantId, lesson_id: lessonId, uploaded_by: actor.user.id,
      file_name: file.fileName, file_path: path, file_size: file.size, mime_type: file.mimeType,
      display_order: (existing?.[0]?.display_order ?? -1) + 1,
    }).select('id').single()
    if (error || !resource) throw new Error('Failed to save lesson media')
    const reference = lessonResourceReference(lessonId, resource.id)
    return { bucket, path, reference, url: reference, resourceId: resource.id, lessonId, mimeType: file.mimeType, size: file.size, fileName: file.fileName }
  } catch (error) {
    await actor.admin.storage.from(bucket).remove([path])
    throw error
  }
}
