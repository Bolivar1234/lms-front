import type { SupabaseClient } from '@supabase/supabase-js'
import { validateUploadFile } from './validation'

/** Prefix is derived from the authenticated request row, never a client storage key. */
export async function storePaymentProof(admin: SupabaseClient, formData: FormData, prefix: string): Promise<string> {
  if (!prefix.split('/').every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) throw new Error('Invalid payment proof scope')
  const file = await validateUploadFile(formData.get('file'), 'proof', 10 * 1024 * 1024)
  const path = `${prefix}/proof.${file.extension}`
  const bucket = admin.storage.from('payment-proofs')
  const { error: uploadError } = await bucket.upload(path, file.bytes, { contentType: file.mimeType, upsert: true })
  if (uploadError) throw new Error('Failed to upload file')
  // Keep the existing persisted-proof contract; a private bucket never has a
  // usable public URL, and an unavailable signature is an explicit failure.
  const { data, error } = await bucket.createSignedUrl(path, 60 * 60 * 24 * 365)
  if (error || !data?.signedUrl) throw new Error('Failed to authorize payment proof access')
  return data.signedUrl
}
