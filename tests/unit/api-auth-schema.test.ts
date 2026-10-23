/**
 * Real supabase-js clients over a fake Auth/PostgREST HTTP boundary. The fixtures
 * expose different rows by schema, so this verifies the actual profile headers,
 * membership fallback, and scoped client returned to API routes. This is not a
 * live GoTrue/RLS or hosted shared-database test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cookieState = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
  createCookieClient: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => cookieState.sessionCookies }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: cookieState.createCookieClient }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: async () => 'cookie-tenant' }))

const LMS_TENANT = '00000000-0000-0000-0000-000000000002'
const PUBLIC_TENANT = '00000000-0000-0000-0000-000000000001'
const USER = {
  id: '10000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'schema-fixture@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

interface HttpHit {
  path: string
  method: string
  profile: string | null
  authorization: string | null
  tenant: string | null
}

let hits: HttpHit[]
let membershipRows: { tenant_id: string }[] | undefined
let rejectAuth: boolean

function token(claims: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER.id, exp: 4102444800, ...claims })}.fixture-signature`
}

function request(bearer = token()) {
  return new Request('https://circles.example.test/api/lessons/1', {
    headers: { authorization: `Bearer ${bearer}` },
  })
}

async function loadAuth(schema: string | undefined) {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_DB_SCHEMA', schema)
  vi.resetModules()
  return import('@/lib/supabase/api-auth')
}

beforeEach(() => {
  hits = []
  membershipRows = undefined
  rejectAuth = false
  cookieState.sessionCookies = []
  cookieState.createCookieClient.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://schema-fixture.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY', 'fixture-anon-key')
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const path = new URL(req.url).pathname
    const profile = req.headers.get(req.method === 'GET' ? 'accept-profile' : 'content-profile')
    hits.push({
      path,
      method: req.method,
      profile,
      authorization: req.headers.get('authorization'),
      tenant: req.headers.get('x-tenant-id'),
    })
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
    if (path === '/auth/v1/user') {
      return rejectAuth ? json({ message: 'invalid JWT' }, 401) : json(USER)
    }
    if (path === '/rest/v1/tenant_users') {
      return json(membershipRows ?? [{ tenant_id: profile === 'lms' ? LMS_TENANT : PUBLIC_TENANT }])
    }
    if (path === '/rest/v1/lessons') {
      return json([{ id: 1, title: profile === 'lms' ? 'Shared LMS lesson' : 'Standalone lesson' }])
    }
    if (path === '/rest/v1/rpc/has_course_access') return json(profile === 'lms')
    throw new Error(`Unexpected fixture request: ${req.method} ${path}`)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Bearer database schema routing', () => {
  it('resolves claimless membership from lms and returns a client that reads lms rows', async () => {
    const auth = await loadAuth('lms')
    const bearer = token()
    const context = await auth.getApiAuthContext(request(bearer))
    expect(context?.tenantId).toBe(LMS_TENANT)
    expect(context?.user.id).toBe(USER.id)
    const result = await context!.supabase.from('lessons').select('id, title')
    expect(result.error).toBeNull()
    expect(result.data).toEqual([{ id: 1, title: 'Shared LMS lesson' }])
    const databaseHits = hits.filter((hit) => hit.path.startsWith('/rest/'))
    expect(databaseHits.map((hit) => [hit.path, hit.profile])).toEqual([
      ['/rest/v1/tenant_users', 'lms'],
      ['/rest/v1/lessons', 'lms'],
    ])
    expect(databaseHits.every((hit) => hit.authorization === `Bearer ${bearer}`)).toBe(true)
    expect(databaseHits[1].tenant).toBe(LMS_TENANT)
  })

  it('uses lms for data and RPC requests with a verified tenant claim', async () => {
    const auth = await loadAuth('lms')
    const context = await auth.getApiAuthContext(request(token({ tenant_id: LMS_TENANT })))
    expect(context?.tenantId).toBe(LMS_TENANT)
    const result = await context!.supabase.rpc('has_course_access', { _user_id: USER.id, _course_id: 1 })
    expect(result.error).toBeNull()
    expect(result.data).toBe(true)
    expect(hits.filter((hit) => hit.path.startsWith('/rest/'))).toMatchObject([
      { path: '/rest/v1/rpc/has_course_access', method: 'POST', profile: 'lms', tenant: LMS_TENANT },
    ])
  })

  it.each([undefined, 'public'])('retains public reads for standalone schema %j', async (schema) => {
    const auth = await loadAuth(schema)
    const context = await auth.getApiAuthContext(request())
    expect(context?.tenantId).toBe(PUBLIC_TENANT)
    const result = await context!.supabase.from('lessons').select('id, title')
    expect(result.data).toEqual([{ id: 1, title: 'Standalone lesson' }])
    expect(hits.filter((hit) => hit.path.startsWith('/rest/')).every((hit) => hit.profile === 'public')).toBe(true)
  })

  it('does not query any schema when token verification fails', async () => {
    rejectAuth = true
    const auth = await loadAuth('lms')
    expect(await auth.getApiAuthContext(request())).toBeNull()
    expect(hits.map((hit) => hit.path)).toEqual(['/auth/v1/user'])
  })

  it.each([
    { label: 'missing', rows: [] },
    { label: 'ambiguous', rows: [{ tenant_id: LMS_TENANT }, { tenant_id: PUBLIC_TENANT }] },
  ])(
    'rejects $label claimless membership', async ({ rows }) => {
      membershipRows = rows
      const auth = await loadAuth('lms')
      expect(await auth.getApiAuthContext(request())).toBeNull()
      expect(hits.filter((hit) => hit.path === '/rest/v1/lessons')).toEqual([])
    },
  )

  it('preserves the existing cookie-priority behavior for mixed credentials', async () => {
    cookieState.sessionCookies = [{ name: 'sb-fixture-auth-token', value: 'cookie-session' }]
    const cookieClient = { auth: { getUser: async () => ({ data: { user: { id: 'cookie-user' } } }) } }
    cookieState.createCookieClient.mockResolvedValue(cookieClient)
    const auth = await loadAuth('lms')
    expect(await auth.getApiAuthContext(request())).toEqual({
      user: { id: 'cookie-user' }, tenantId: 'cookie-tenant', supabase: cookieClient,
    })
    expect(hits).toEqual([])
  })
})
