'use server'

import { uploadScopedAsset } from '@/app/actions/storage'
import type { LessonMediaPurpose } from '@/lib/storage/types'

export async function uploadLessonMedia(lessonId: number, formData: FormData, purpose: LessonMediaPurpose = 'lesson-audio') {
  if (!['lesson-audio', 'lesson-image', 'lesson-file'].includes(purpose)) return { success: false as const, error: 'Invalid upload purpose' }
  return uploadScopedAsset({ purpose, lessonId }, formData)
}
