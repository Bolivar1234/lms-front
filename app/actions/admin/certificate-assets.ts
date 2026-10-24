'use server'

import { uploadScopedAsset } from '@/app/actions/storage'
import { recordAssetUploader } from '@/lib/assets/record-uploader'

export async function uploadCertificateAsset(formData: FormData) {
  const value = formData.get('courseId')
  const courseId = value === null || value === '' ? undefined : Number(value)
  const purpose = formData.get('type') === 'signature' ? 'certificate-signature' : 'certificate-logo'
  const result = await uploadScopedAsset({ purpose, courseId }, formData)
  if (result.success && result.data) await recordAssetUploader(result.data.bucket, result.data.path)
  return result
}
