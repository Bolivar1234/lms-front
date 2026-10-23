'use server'

import type { ActionResult } from '@/lib/supabase/admin'
import type { StorageUploadScope, UploadedAsset } from '@/lib/storage/types'
import { uploadPublicAsset } from '@/lib/storage/upload'
import { storeLessonMedia } from '@/lib/storage/lesson-media'

export async function uploadScopedAsset(scope: StorageUploadScope, formData: FormData): Promise<ActionResult<UploadedAsset>> {
  try {
    if (!scope || typeof scope !== 'object') throw new Error('Invalid upload purpose')
    if (scope.purpose === 'lesson-audio' || scope.purpose === 'lesson-file' || scope.purpose === 'lesson-image') {
      return { success: true, data: await storeLessonMedia(scope.lessonId, formData, scope.purpose, scope.courseId) }
    }
    if (!['landing-image', 'course-image', 'certificate-logo', 'certificate-signature', 'avatar'].includes(scope.purpose)) throw new Error('Invalid upload purpose')
    return { success: true, data: await uploadPublicAsset(scope, formData) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Upload failed' }
  }
}
