import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('configured Supabase database schema', () => {
  it.each([
    [undefined, 'public'],
    ['', 'public'],
    ['   ', 'public'],
    ['public', 'public'],
    ['lms', 'lms'],
    [' lms ', 'lms'],
  ])('resolves %j to %s', async (configured, expected) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_DB_SCHEMA', configured)
    vi.resetModules()
    expect((await import('@/lib/supabase/schema')).DB_SCHEMA).toBe(expected)
  })

  it.each(['publci', 'LMS', 'auth', 'storage', 'lms,public'])('rejects unsupported schema %s', async (configured) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_DB_SCHEMA', configured)
    vi.resetModules()
    await expect(import('@/lib/supabase/schema')).rejects.toThrow(
      'NEXT_PUBLIC_SUPABASE_DB_SCHEMA must be public or lms',
    )
  })
})
