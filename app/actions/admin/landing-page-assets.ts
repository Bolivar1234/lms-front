'use server'

import { uploadScopedAsset } from '@/app/actions/storage'
import type { ActionResult } from '@/lib/supabase/admin'
import { authorizeCourseStorage } from '@/lib/storage/authorization'
import { storagePathFromPublicUrl } from '@/lib/storage/upload'

export async function uploadLandingPageAsset(formData: FormData) {
  return uploadScopedAsset({ purpose: 'landing-image' }, formData)
}

export async function deleteLandingPageAsset(fileUrl: string): Promise<ActionResult> {
  try {
    const actor = await authorizeCourseStorage(undefined, true)
    const path = storagePathFromPublicUrl(fileUrl, 'landing-page-assets')
    if (!path || !path.startsWith(`${actor.tenantId}/`)) throw new Error('Invalid file URL or access denied')
    const { error } = await actor.admin.storage.from('landing-page-assets').remove([path])
    if (error) throw new Error('Failed to delete image')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete image' }
  }
}
