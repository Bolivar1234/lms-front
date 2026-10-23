import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLessonMediaUrl, subscribeToLessonMedia } from '@/components/lesson/use-lesson-media-url'
import { blocksToMdx, mdxToBlocks } from '@/components/teacher/block-editor/serializer'

const reference = 'lesson-resource://42/91'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('private lesson-media viewers', () => {
  it('resolves JSON through the authenticated signer and returns the URL, keeping the durable reference intact', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ url: 'https://storage.example/audio?token=first', expiresIn: 300 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await resolveLessonMediaUrl(reference)).toEqual({ url: 'https://storage.example/audio?token=first', expiresIn: 300 })
    expect(fetcher).toHaveBeenCalledWith('/api/lessons/42/resources/91/url', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
    expect(reference).toBe('lesson-resource://42/91')
  })

  it('preserves external URL fallback without calling the signer', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await resolveLessonMediaUrl('https://audio.example/pronunciation.mp3')).toEqual({ url: 'https://audio.example/pronunciation.mp3' })
    expect(fetcher).not.toHaveBeenCalled()
    await expect(resolveLessonMediaUrl('lesson-resource://42/wrong')).rejects.toThrow('invalid')
  })

  it('renews before the 300-second TTL and clears a denied renewal', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ url: 'https://storage.example?token=first', expiresIn: 300 }))
      .mockResolvedValueOnce(Response.json({ url: 'https://storage.example?token=renewed', expiresIn: 300 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    const update = vi.fn()
    const subscription = subscribeToLessonMedia(reference, update)
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenLastCalledWith({ source: reference, url: 'https://storage.example?token=first' })
    await vi.advanceTimersByTimeAsync(269_999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(update).toHaveBeenLastCalledWith({ source: reference, url: 'https://storage.example?token=renewed' })
    await vi.advanceTimersByTimeAsync(270_000)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ source: reference, url: '', error: expect.stringContaining('course access') }))
    subscription.dispose()
  })

  it('renews on tab resume after expiry and ignores late responses after unmount', async () => {
    vi.useFakeTimers()
    let complete: ((response: Response) => void) | undefined
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ url: 'https://storage.example?token=first', expiresIn: 300 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const update = vi.fn()
    const subscription = subscribeToLessonMedia(reference, update)
    await vi.advanceTimersByTimeAsync(0)
    vi.setSystemTime(Date.now() + 310_000)
    subscription.refreshIfExpiring()
    expect(fetcher).toHaveBeenCalledTimes(2)
    subscription.dispose()
    complete!(Response.json({ url: 'https://storage.example?token=late', expiresIn: 300 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true)
  })
})

describe('lesson media MDX roundtrip', () => {
  it('retains durable audio/file refs and both vocabulary audio spellings', () => {
    const content = `<Audio src="${reference}" title="Listening" />\n\n<Vocabulary word="hello" translation="hola" audioUrl="${reference}" />\n\n<Vocabulary word="old" translation="legacy" audio="https://audio.example/old.mp3" />\n\n<FileDownload url="${reference}" filename="notes.pdf" />`
    const blocks = mdxToBlocks(content)
    expect(blocks.map((block) => block.type)).toEqual(['audio', 'vocabulary', 'vocabulary', 'file-download'])
    expect(blocksToMdx(blocks)).toBe(content)
    expect(blocksToMdx(blocks)).not.toContain('token=')
  })

  it('preserves both vocabulary aliases when an older lesson contains both', () => {
    const content = `<Vocabulary word="hello" translation="hola" audioUrl="${reference}" audio="https://audio.example/legacy.mp3" />`
    expect(blocksToMdx(mdxToBlocks(content))).toBe(content)
  })
})
