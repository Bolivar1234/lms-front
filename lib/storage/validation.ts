import sharp from 'sharp'

export type FileCategory = 'image' | 'document' | 'audio' | 'community' | 'proof'
export interface ValidatedFile { bytes: Buffer; mimeType: string; extension: string; fileName: string; size: number }

function starts(bytes: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

function rasterType(bytes: Buffer): string | null {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])) return 'png'
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'gif'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  return null
}

function documentType(bytes: Buffer): { mimeType: string; extension: string } | null {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.subarray(-2048).includes(Buffer.from('%%EOF'))) {
    return { mimeType: 'application/pdf', extension: 'pdf' }
  }
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && bytes.length >= 512) {
    if (bytes.includes(Buffer.from('WordDocument', 'utf16le'))) return { mimeType: 'application/msword', extension: 'doc' }
    if (bytes.includes(Buffer.from('Workbook', 'utf16le'))) return { mimeType: 'application/vnd.ms-excel', extension: 'xls' }
  }
  if (starts(bytes, [0x50, 0x4b, 3, 4])) {
    // Require a real ZIP central directory; do not unpack untrusted archives.
    const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]))
    if (end < 0 || end + 22 > bytes.length || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) return null
    const count = bytes.readUInt16LE(end + 10)
    const directoryEnd = bytes.readUInt32LE(end + 16) + bytes.readUInt32LE(end + 12)
    if (directoryEnd > end || count > 10000) return null
    let position = bytes.readUInt32LE(end + 16)
    const names = new Set<string>()
    for (let index = 0; index < count; index++) {
      if (position + 46 > directoryEnd || bytes.readUInt32LE(position) !== 0x02014b50) return null
      const nameLength = bytes.readUInt16LE(position + 28)
      const next = position + 46 + nameLength + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32)
      if (next > directoryEnd) return null
      names.add(bytes.subarray(position + 46, position + 46 + nameLength).toString('utf8'))
      position = next
    }
    if (position !== directoryEnd || !names.has('[Content_Types].xml') || !names.has('_rels/.rels')) return null
    if (names.has('word/document.xml')) return { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' }
    if (names.has('xl/workbook.xml')) return { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' }
  }
  return null
}

function mediaType(bytes: Buffer, category: FileCategory): { mimeType: string; extension: string } | null {
  if (bytes.length < 16) return null
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE' && bytes.includes(Buffer.from('data'))) return { mimeType: 'audio/wav', extension: 'wav' }
  if (bytes.subarray(0, 4).toString('ascii') === 'OggS' && (bytes.includes(Buffer.from('OpusHead')) || bytes.includes(Buffer.from('vorbis')))) return { mimeType: 'audio/ogg', extension: 'ogg' }
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && bytes.subarray(0, 4096).includes(Buffer.from('webm'))) return { mimeType: category === 'community' ? 'video/webm' : 'audio/webm', extension: 'webm' }
  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii')
    if (category === 'community') return { mimeType: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4', extension: brand === 'qt  ' ? 'mov' : 'mp4' }
    if (['M4A ', 'M4B ', 'isom', 'mp42', 'mp41'].includes(brand)) return { mimeType: 'audio/mp4', extension: 'm4a' }
  }
  // Skip a bounded ID3v2 tag and require an MPEG audio frame after it.
  let offset = 0
  if (bytes.subarray(0, 3).toString('ascii') === 'ID3') {
    if ([6, 7, 8, 9].some((index) => bytes[index] > 0x7f)) return null
    offset = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9])
  }
  if (offset + 4 < bytes.length && bytes[offset] === 0xff && (bytes[offset + 1] & 0xe0) === 0xe0) {
    if ((bytes[offset + 1] & 0xf6) === 0xf0) return { mimeType: 'audio/aac', extension: 'aac' }
    if ((bytes[offset + 1] & 0x06) !== 0 && (bytes[offset + 2] & 0xf0) !== 0xf0 && (bytes[offset + 2] & 0x0c) !== 0x0c) return { mimeType: 'audio/mpeg', extension: 'mp3' }
  }
  return null
}

/**
 * `imageFormat` picks the re-encoded raster format. WebP is the default; PNG is
 * for consumers that cannot read WebP, such as React PDF on certificates. PNG
 * keeps transparency (signatures) and takes the first frame of an animation.
 */
export async function validateUploadFile(
  value: FormDataEntryValue | null,
  category: FileCategory,
  maxBytes: number,
  options: { imageFormat?: 'webp' | 'png' } = {}
): Promise<ValidatedFile> {
  const imageFormat = options.imageFormat ?? 'webp'
  if (!(value instanceof File) || value.size === 0) throw new Error('No file provided')
  if (value.size > maxBytes) throw new Error(`File must be under ${Math.floor(maxBytes / 1024 / 1024)}MB`)
  const bytes = Buffer.from(await value.arrayBuffer())
  const fileName = value.name.replace(/[\x00-\x1f\x7f/\\]/g, '').slice(0, 200) || 'upload'
  const raster = rasterType(bytes)
  if (raster && category !== 'audio') {
    try {
      const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning', animated: imageFormat === 'webp' })
      const metadata = await image.metadata()
      if (metadata.format !== raster) throw new Error('Unsupported image')
      const rotated = image.rotate()
      const output = await (imageFormat === 'png' ? rotated.png() : rotated.webp({ quality: 90 })).toBuffer()
      if (output.length > maxBytes) throw new Error('Decoded image exceeds the upload limit')
      return { bytes: output, mimeType: `image/${imageFormat}`, extension: imageFormat, fileName, size: output.length }
    } catch {
      throw new Error('Invalid or unsupported image file')
    }
  }
  if (category === 'image') throw new Error('Use a valid JPEG, PNG, GIF, or WebP image; SVG is not supported')
  const document = documentType(bytes)
  if (document && category !== 'audio' && (category === 'document' || document.extension === 'pdf')) return { bytes, ...document, fileName, size: bytes.length }
  if (category === 'document' && value.type === 'text/csv') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (text.includes('\0') || /^\s*</.test(text)) throw new Error('Invalid CSV')
      return { bytes, mimeType: 'text/csv', extension: 'csv', fileName, size: bytes.length }
    } catch { throw new Error('Invalid CSV file') }
  }
  if (category === 'audio' || category === 'community') {
    const media = mediaType(bytes, category)
    if (media) return { bytes, ...media, fileName, size: bytes.length }
  }
  throw new Error('File contents do not match a supported file type')
}
