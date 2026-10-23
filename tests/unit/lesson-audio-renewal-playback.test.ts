/** Exercise the production handlers; real Chromium media-event ordering is covered by authenticated-uploads.spec.ts. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type AudioHTMLAttributes, type ReactNode, type SyntheticEvent } from 'react'

const fixture = vi.hoisted(() => ({
  url: 'https://storage.example/audio.wav?token=first',
  playback: { current: { time: 0, playing: false } },
}))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: () => fixture.playback,
  useEffect: () => undefined,
}))
vi.mock('@/components/lesson/use-lesson-media-url', () => ({
  useLessonMediaUrl: () => ({ url: fixture.url, loading: false, error: undefined, refresh: vi.fn() }),
}))

import { Audio } from '@/components/lesson/audio'

function audioProps(node: ReactNode): AudioHTMLAttributes<HTMLAudioElement> {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = audioProps(child)
      if (result.src) return result
    }
  } else if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === 'audio') return node.props as AudioHTMLAttributes<HTMLAudioElement>
    return audioProps(node.props.children)
  }
  return {}
}

function renderAudio() { return audioProps(Audio({ src: 'lesson-resource://42/91' })) }
function event(element: { currentTime: number; readyState: number; play: () => Promise<void> }) { return { currentTarget: element } as unknown as SyntheticEvent<HTMLAudioElement> }

beforeEach(() => {
  fixture.url = 'https://storage.example/audio.wav?token=first'
  fixture.playback.current = { time: 0, playing: false }
})

describe('lesson audio signed-source rotation', () => {
  it.each([true, false])('retains seek and playing=%s through loading-reset timeupdate/pause events', (playing) => {
    const original = renderAudio()
    const element = { currentTime: 3, readyState: 4, play: vi.fn().mockResolvedValue(undefined) }
    original.onTimeUpdate!(event(element))
    original.onPlay!(event(element))
    if (!playing) original.onPause!(event(element))
    fixture.url = 'https://storage.example/audio.wav?token=distinct-second'
    const renewed = renderAudio()
    expect(renewed.src).not.toBe(original.src)
    element.currentTime = 0
    element.readyState = 0
    renewed.onTimeUpdate!(event(element))
    renewed.onPause!(event(element))
    element.readyState = 1
    renewed.onLoadedMetadata!(event(element))
    expect(element.currentTime).toBe(3)
    expect(element.play).toHaveBeenCalledTimes(playing ? 1 : 0)
  })

  it('preserves a legitimate seek to zero while the current source has metadata', () => {
    const original = renderAudio()
    const element = { currentTime: 3, readyState: 4, play: vi.fn().mockResolvedValue(undefined) }
    original.onTimeUpdate!(event(element))
    element.currentTime = 0
    original.onTimeUpdate!(event(element))
    fixture.url = 'https://storage.example/audio.wav?token=distinct-third'
    const renewed = renderAudio()
    expect(renewed.src).not.toBe(original.src)
    element.readyState = 0
    renewed.onTimeUpdate!(event(element))
    element.readyState = 1
    renewed.onLoadedMetadata!(event(element))
    expect(element.currentTime).toBe(0)
    expect(element.play).not.toHaveBeenCalled()
  })
})
