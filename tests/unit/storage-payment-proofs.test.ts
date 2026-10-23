import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storePaymentProof } from '@/lib/storage/payment-proofs'

const form = (bytes = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF') => {
  const data = new FormData()
  data.set('file', new File([bytes], 'untrusted.html', { type: 'text/html' }))
  return data
}

function fixture(signError = false, emptySignature = false, uploadError = false) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError ? new Error('refused') : null })
  const sign = vi.fn().mockResolvedValue({ error: signError ? new Error('refused') : null, data: emptySignature ? null : { signedUrl: 'https://private.test/proof?token=valid' } })
  const from = vi.fn().mockReturnValue({ upload, createSignedUrl: sign })
  return { admin: { storage: { from } } as unknown as SupabaseClient, upload, sign, from }
}

describe('private payment proof writer', () => {
  it.each(['platform/tenant-a/request-a', 'student/tenant-a/user-a/4'])('retains scoped %s proof replacement with a validated canonical type', async (prefix) => {
    const { admin, upload, sign, from } = fixture()
    expect(await storePaymentProof(admin, form(), prefix)).toBe('https://private.test/proof?token=valid')
    expect(from).toHaveBeenCalledWith('payment-proofs')
    expect(upload).toHaveBeenCalledWith(`${prefix}/proof.pdf`, expect.any(Buffer), { contentType: 'application/pdf', upsert: true })
    expect(sign).toHaveBeenCalledWith(`${prefix}/proof.pdf`, 31536000)
  })
  it.each([[true, false], [false, true]])('fails explicitly when signing fails or returns no URL', async (error, empty) => {
    const { admin } = fixture(error, empty)
    await expect(storePaymentProof(admin, form(), 'tenant-a/user-a/4')).rejects.toThrow('Failed to authorize payment proof access')
  })
  it('does not sign an unsuccessful upload', async () => {
    const { admin, sign } = fixture(false, false, true)
    await expect(storePaymentProof(admin, form(), 'tenant-a/user-a/4')).rejects.toThrow('Failed to upload file')
    expect(sign).not.toHaveBeenCalled()
  })
  it('refuses forged MIME bytes and client path encodings before storage writes', async () => {
    const { admin, upload } = fixture()
    await expect(storePaymentProof(admin, form('<html>fake proof</html>'), 'tenant-a/user-a/4')).rejects.toThrow(/supported file type/)
    for (const prefix of ['tenant-a/../victim', 'tenant-a/%2e%2e/4', '/tenant-a/user-a/4']) {
      await expect(storePaymentProof(admin, form(), prefix)).rejects.toThrow(/Invalid payment proof scope/)
    }
    expect(upload).not.toHaveBeenCalled()
  })
})
