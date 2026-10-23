'use server'

import { uploadScopedAsset } from '@/app/actions/storage'

export async function uploadCertificateAsset(formData: FormData) {
  const value = formData.get('courseId')
  const courseId = value === null || value === '' ? undefined : Number(value)
  const purpose = formData.get('type') === 'signature' ? 'certificate-signature' : 'certificate-logo'
  return uploadScopedAsset({ purpose, courseId }, formData)
}
