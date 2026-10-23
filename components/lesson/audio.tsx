'use client'

import { useEffect, useRef } from 'react'
import { useLessonMediaUrl } from './use-lesson-media-url'
import { cn } from '@/lib/utils'
import { IconVolume } from '@tabler/icons-react'

interface AudioProps {
  src: string
  title?: string
  className?: string
}

export function Audio({ src, title, className }: AudioProps) {
  const media = useLessonMediaUrl(src)
  const playback = useRef({ time: 0, playing: false })
  useEffect(() => { playback.current = { time: 0, playing: false } }, [src])
  return (
    <div
      className={cn(
        'my-4 rounded-lg border bg-card p-4',
        className
      )}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <IconVolume className="size-5 shrink-0 text-brand-text" aria-hidden="true" />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
      )}
      {media.error && <p role="alert" className="text-sm text-destructive">{media.error} <button type="button" onClick={media.refresh} className="underline">Try again</button></p>}
      {media.loading && <p role="status" className="text-sm text-muted-foreground">Loading audio…</p>}
      <audio controls className="w-full" src={media.url} onTimeUpdate={(event) => {
        // Replacing a signed src emits a loading reset at time 0 before metadata arrives.
        if (event.currentTarget.readyState > 0) playback.current.time = event.currentTarget.currentTime
      }} onPlay={() => { playback.current.playing = true }} onPause={(event) => { if (event.currentTarget.readyState > 0) playback.current.playing = false }}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget
          audio.currentTime = playback.current.time
          if (playback.current.playing) void audio.play().catch(() => {})
        }}>
        Your browser does not support the audio element.
      </audio>
    </div>
  )
}
