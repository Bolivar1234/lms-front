'use server'

import { uploadScopedAsset } from '@/app/actions/storage'

export async function uploadCourseImage(formData: FormData): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const value = formData.get('courseId')
  const courseId = value === null || value === '' ? undefined : Number(value)
  const result = await uploadScopedAsset({ purpose: 'course-image', courseId }, formData)
  return result.success ? { success: true, url: result.data!.url } : result
}
