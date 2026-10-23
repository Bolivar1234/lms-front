import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { validateUploadFile } from '@/lib/storage/validation'
import { isScopedLessonResourcePath } from '@/lib/storage/references'

const png = () => sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }).png().toBuffer()
const file = (bytes: Uint8Array | string, name = 'image.png', type = 'image/png') => new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type })

describe('trusted storage byte validation', () => {
  it('decodes and re-encodes a real image with a canonical MIME and extension', async () => {
    const result = await validateUploadFile(file(await png(), 'spoof.html', 'text/html'), 'image', 1024 * 1024)
    expect(result.extension).toBe('webp')
    expect(result.mimeType).toBe('image/webp')
    expect((await sharp(result.bytes).metadata()).format).toBe('webp')
  })
  it('strips appended attacker bytes from an otherwise valid raster image', async () => {
    const result = await validateUploadFile(file(Buffer.concat([await png(), Buffer.from('<script>bad()</script>')])), 'image', 1024 * 1024)
    expect(result.bytes.includes(Buffer.from('<script>'))).toBe(false)
  })
  it.each(['<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>', '<html>not an image</html>'])('rejects spoofed raster MIME content', async (bytes) => {
    await expect(validateUploadFile(file(bytes), 'image', 1024 * 1024)).rejects.toThrow(/valid JPEG/)
  })
  it('rejects a truncated raster despite its correct magic bytes', async () => {
    await expect(validateUploadFile(file(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), 'image', 1024)).rejects.toThrow(/Invalid/)
  })
  it('rejects empty and oversized files before reading their content', async () => {
    await expect(validateUploadFile(file(''), 'image', 1024)).rejects.toThrow(/No file/)
    await expect(validateUploadFile(file('12345'), 'image', 4)).rejects.toThrow(/under/)
    await expect(validateUploadFile('not a File', 'image', 1024)).rejects.toThrow(/No file/)
  })
  it('permits PDF proof bytes regardless of an untrusted filename or MIME', async () => {
    const result = await validateUploadFile(file('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'proof.exe', 'application/octet-stream'), 'proof', 1024)
    expect(result.extension).toBe('pdf')
    expect(result.mimeType).toBe('application/pdf')
  })
  it('rejects a truncated PDF, an arbitrary ZIP and HTML forged as a proof', async () => {
    for (const bytes of ['%PDF-1.4\ntruncated', 'PK\u0003\u0004fake archive', '<html>proof</html>']) {
      await expect(validateUploadFile(file(bytes, 'proof.pdf', 'application/pdf'), 'proof', 1024)).rejects.toThrow(/supported file type/)
    }
  })
  it('validates audio bytes and derives WAV instead of trusting an extension', async () => {
    const wav = Buffer.alloc(48)
    wav.write('RIFF'); wav.writeUInt32LE(40, 4); wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(4, 40)
    expect((await validateUploadFile(file(wav, 'audio.html', 'text/html'), 'audio', 1024)).mimeType).toBe('audio/wav')
    await expect(validateUploadFile(file('ID3bad fake audio header', 'voice.mp3', 'audio/mpeg'), 'audio', 1024)).rejects.toThrow(/supported file type/)
  })
  it('accepts UTF-8 CSV attachments and refuses HTML or invalid UTF-8', async () => {
    expect((await validateUploadFile(file('name,value\nA,1', 'data.csv', 'text/csv'), 'document', 1024)).extension).toBe('csv')
    await expect(validateUploadFile(file('<html>fake CSV</html>', 'data.csv', 'text/csv'), 'document', 1024)).rejects.toThrow(/Invalid CSV/)
    await expect(validateUploadFile(file(new Uint8Array([0xff]), 'data.csv', 'text/csv'), 'document', 1024)).rejects.toThrow(/Invalid CSV/)
  })
  it('binds private resource paths to the exact tenant and lesson', () => {
    expect(isScopedLessonResourcePath('tenant-a/10/file.pdf', 'tenant-a', 10)).toBe(true)
    for (const path of ['tenant-b/10/file.pdf', 'tenant-a/11/file.pdf', 'tenant-a/10/../11/file.pdf', 'tenant-a/10/%2e%2e.pdf', 'tenant-a/100/file.pdf']) {
      expect(isScopedLessonResourcePath(path, 'tenant-a', 10)).toBe(false)
    }
  })
})
