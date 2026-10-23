'use client'

import { useLayoutEffect, useId, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UploadLifecycle } from './upload-lifecycle'

export type UploadResult = { success: true; data?: { url: string; fileName?: string } } | { success: false; error: string }

export interface MediaUploadFieldProps {
  id?: string
  name?: string
  label?: string
  value: string
  onChange: (value: string) => void
  uploadAction: (data: FormData) => Promise<UploadResult>
  accept: string
  maxBytes: number
  disabled?: boolean
  uploadDisabled?: boolean
  placeholder?: string
  hint?: string
  /** Stable block/item id; an index must never be used as an upload owner. */
  identityKey?: string
  onUploadingChange?: (uploading: boolean) => void
  /** Capture a live-store commit for editors whose field callback may point at an old index. */
  createUploadCommit?: () => (url: string, fileName?: string) => void
  imagePreview?: boolean
  urlReadOnly?: boolean
}

export function MediaUploadField({ id, name, label, value, onChange, uploadAction, accept, maxBytes, disabled, uploadDisabled, placeholder = 'Paste a URL', hint, identityKey = id ?? name ?? '', onUploadingChange, createUploadCommit, imagePreview, urlReadOnly }: MediaUploadFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const fileInput = useRef<HTMLInputElement>(null)
  const lifecycle = useRef(new UploadLifecycle())
  const current = useRef({ value, identityKey, onChange, disabled, onUploadingChange })
  useLayoutEffect(() => {
    lifecycle.current.observe(JSON.stringify([identityKey, value, !!disabled]))
    current.current = { value, identityKey, onChange, disabled, onUploadingChange }
  })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLayoutEffect(() => {
    const guard = lifecycle.current
    guard.activate()
    return () => { guard.dispose(); current.current.onUploadingChange?.(false) }
  }, [])

  async function upload(file: File) {
    if (disabled || uploadDisabled) return
    const request = lifecycle.current.begin()
    const owner = { value, identityKey }
    const commit = createUploadCommit?.()
    setError(null)
    if (file.size > maxBytes) {
      if (fileInput.current) fileInput.current.value = ''
      setError(`Choose a file smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`)
      return
    }
    setUploading(true)
    current.current.onUploadingChange?.(true)
    try {
      const data = new FormData()
      data.append('file', file)
      const result = await uploadAction(data)
      if (!lifecycle.current.isCurrent(request)) return
      const latest = current.current
      if (latest.identityKey !== owner.identityKey || latest.value !== owner.value || latest.disabled) return
      if (!result.success) { setError(result.error); return }
      if (!result.data?.url) { setError('The upload did not return a file URL. Please try again.'); return }
      if (commit) commit(result.data.url, result.data.fileName)
      else latest.onChange(result.data.url)
    } catch (cause) {
      if (lifecycle.current.isCurrent(request)) setError(cause instanceof Error ? cause.message : 'Upload failed. Please try again.')
    } finally {
      if (lifecycle.current.isLatest(request)) {
        setUploading(false)
        current.current.onUploadingChange?.(false)
      }
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="space-y-2" data-upload-field={name ?? label ?? inputId}>
      {label && <label htmlFor={inputId} className="text-sm font-medium">{label}</label>}
      <div className="flex flex-wrap gap-2">
        <Input id={inputId} name={name} value={value} disabled={disabled} readOnly={urlReadOnly} placeholder={placeholder} aria-label={label ?? placeholder} className="min-w-0 flex-1" onChange={(event) => { lifecycle.current.cancel(); setUploading(false); current.current.onUploadingChange?.(false); setError(null); onChange(event.target.value) }} />
        <input ref={fileInput} type="file" accept={accept} className="sr-only" aria-label={`Upload ${label ?? 'file'}`} disabled={disabled || uploadDisabled || uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
        <Button type="button" variant="outline" disabled={disabled || uploadDisabled || uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {imagePreview && value && <img src={value} alt={`${label ?? 'Image'} preview`} className="max-h-32 max-w-full rounded-md border object-contain" />}
    </div>
  )
}

export function ImageUploadField(props: Omit<MediaUploadFieldProps, 'accept' | 'maxBytes' | 'imagePreview'> & { maxBytes?: number }) {
  return <MediaUploadField {...props} accept="image/jpeg,image/png,image/gif,image/webp" maxBytes={props.maxBytes ?? 5 * 1024 * 1024} imagePreview />
}
