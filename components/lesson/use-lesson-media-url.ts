'use client'

import { useCallback, useEffect, useState } from 'react'
import { parseLessonResourceReference } from '@/lib/storage/references'

export async function resolveLessonMediaUrl(value: string, signal?: AbortSignal): Promise<{ url: string; expiresIn?: number }> {
  const resource = parseLessonResourceReference(value)
  if (!resource) {
    if (value.startsWith('lesson-resource:')) throw new Error('This lesson media reference is invalid.')
    return { url: value }
  }
  const response = await fetch(`/api/lessons/${resource.lessonId}/resources/${resource.resourceId}/url`, { signal, cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('This lesson file is unavailable. Check your course access and try again.')
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string' || !result.url.trim() || !('expiresIn' in result) || typeof result.expiresIn !== 'number' || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0) throw new Error('The lesson file could not be loaded.')
  return { url: result.url, expiresIn: result.expiresIn }
}

interface MediaResolution { source: string; url: string; error?: string }

/** Renewal belongs to the mounted viewer, never to the saved lesson document. */
export function subscribeToLessonMedia(value: string, onUpdate: (state: MediaResolution) => void) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let expiresAt = 0
  let pending = false
  async function renew() {
    if (pending || controller.signal.aborted) return
    pending = true
    try {
      const result = await resolveLessonMediaUrl(value, controller.signal)
      if (controller.signal.aborted) return
      expiresAt = Date.now() + (result.expiresIn ?? 300) * 1000
      onUpdate({ source: value, url: result.url })
      timer = setTimeout(() => void renew(), Math.max(1000, ((result.expiresIn ?? 300) - 30) * 1000))
    } catch (cause) {
      if (!controller.signal.aborted) onUpdate({ source: value, url: '', error: cause instanceof Error ? cause.message : 'The lesson file could not be loaded.' })
    } finally {
      pending = false
    }
  }
  void renew()
  return {
    refreshIfExpiring() {
      if (Date.now() >= expiresAt - 30_000) { clearTimeout(timer); void renew() }
    },
    dispose() { controller.abort(); clearTimeout(timer) },
  }
}

/** Signed URLs remain transient client state; the MDX only contains durable resource ids. */
export function useLessonMediaUrl(value: string | undefined) {
  const [resolved, setResolved] = useState<MediaResolution>()
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((count) => count + 1), [])
  const privateMedia = !!value && value.startsWith('lesson-resource:')
  useEffect(() => {
    if (!value || !privateMedia) return
    const subscription = subscribeToLessonMedia(value, setResolved)
    const onVisible = () => { if (document.visibilityState === 'visible') subscription.refreshIfExpiring() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { subscription.dispose(); document.removeEventListener('visibilitychange', onVisible) }
  }, [value, privateMedia, revision])
  return {
    url: privateMedia ? resolved?.source === value ? resolved.url : undefined : value,
    error: privateMedia && resolved?.source === value ? resolved.error : undefined,
    loading: privateMedia && (!resolved || resolved.source !== value),
    refresh,
  }
}
