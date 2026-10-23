import { nanoid } from 'nanoid'
import { authorizeCourseStorage, getStorageActor } from './authorization'
import { validateUploadFile } from './validation'
import type { StorageUploadScope, UploadedAsset } from './types'

export function storagePathFromPublicUrl(value: string, bucket: string): string | null {
  try {
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    const url = new URL(value)
    const prefix = `/storage/v1/object/public/${bucket}/`
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null
    const path = decodeURIComponent(url.pathname.slice(prefix.length))
    return path.split('/').every((segment) => /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(segment)) ? path : null
  } catch { return null }
}

type PublicScope = Exclude<StorageUploadScope, { lessonId: number }>

export async function uploadPublicAsset(scope: PublicScope, formData: FormData): Promise<UploadedAsset> {
  if (scope.purpose === 'avatar') return uploadAvatar(formData)
  const courseId = 'courseId' in scope ? scope.courseId : undefined
  const actor = await authorizeCourseStorage(courseId, scope.purpose === 'landing-image')
  const certificate = scope.purpose === 'certificate-logo' || scope.purpose === 'certificate-signature'
  const file = await validateUploadFile(formData.get('file'), 'image', (certificate ? 2 : 5) * 1024 * 1024)
  const bucket = scope.purpose === 'course-image' ? 'course-images' : 'landing-page-assets'
  const folder = certificate ? 'certificates' : scope.purpose === 'course-image' ? `courses/${courseId ?? `draft-${actor.user.id}`}` : 'images'
  const path = `${actor.tenantId}/${folder}/${nanoid()}.${file.extension}`
  const { error } = await actor.admin.storage.from(bucket).upload(path, file.bytes, { contentType: file.mimeType, upsert: false })
  if (error) throw new Error('Failed to upload image')
  const { data } = actor.admin.storage.from(bucket).getPublicUrl(path)
  return { bucket, path, url: data.publicUrl, reference: data.publicUrl, mimeType: file.mimeType, size: file.size, fileName: file.fileName }
}

export async function uploadAvatar(formData: FormData): Promise<UploadedAsset> {
  const actor = await getStorageActor()
  const file = await validateUploadFile(formData.get('file'), 'image', 2 * 1024 * 1024)
  const { data: profile, error: profileError } = await actor.supabase.from('profiles').select('avatar_url').eq('id', actor.user.id).maybeSingle()
  if (profileError || !profile) throw new Error('Profile not found')
  const bucket = 'avatars'
  const path = `${actor.user.id}/${nanoid()}.${file.extension}`
  const { error } = await actor.admin.storage.from(bucket).upload(path, file.bytes, { contentType: file.mimeType, upsert: false })
  if (error) throw new Error('Failed to upload avatar')
  const { data } = actor.admin.storage.from(bucket).getPublicUrl(path)
  const { data: saved, error: saveError } = await actor.supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', actor.user.id).select('id').maybeSingle()
  if (saveError || !saved) {
    await actor.admin.storage.from(bucket).remove([path])
    throw new Error('Failed to save avatar')
  }
  const oldPath = profile.avatar_url ? storagePathFromPublicUrl(profile.avatar_url, bucket) : null
  if (oldPath?.startsWith(`${actor.user.id}/`)) await actor.admin.storage.from(bucket).remove([oldPath])
  return { bucket, path, url: data.publicUrl, reference: data.publicUrl, mimeType: file.mimeType, size: file.size, fileName: file.fileName }
}
