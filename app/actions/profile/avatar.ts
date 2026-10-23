'use server'

import { uploadScopedAsset } from '@/app/actions/storage'

export async function uploadUserAvatar(formData: FormData) {
  return uploadScopedAsset({ purpose: 'avatar' }, formData)
}
