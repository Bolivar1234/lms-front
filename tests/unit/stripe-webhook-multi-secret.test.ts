import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const secretsTried: string[] = []
let acceptedSecret = ''
let secretsEnv = ''

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (_payload: string, _sig: string, secret: string) => {
        secretsTried.push(secret)
        if (secret !== acceptedSecret) throw new Error('bad signature')
        // An event type the handler ignores, so only verification is exercised.
        return { id: 'evt_1', type: 'ping.ignored', data: { object: {} } }
      },
    },
  }),
  getWebhookSecret: () => secretsEnv,
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/payments/webhook-dispatch', () => ({ dispatchBillingEvent: vi.fn() }))
vi.mock('@/lib/analytics/server', () => ({
  track: () => Promise.resolve(),
  safeAnalytics: (fn: () => Promise<unknown>) => fn(),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function req(): NextRequest {
  return {
    text: () => Promise.resolve('{}'),
    headers: new Headers({ 'stripe-signature': 't=1,v1=sig' }),
  } as unknown as NextRequest
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  secretsTried.length = 0
})

describe('POST /api/stripe/webhook — comma-separated signing secrets', () => {
  it('accepts an event signed with the second secret (account-scoped endpoint)', async () => {
    secretsEnv = 'whsec_connect, whsec_account'
    acceptedSecret = 'whsec_account'

    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(secretsTried).toEqual(['whsec_connect', 'whsec_account'])
  })

  it('rejects an event signed with none of the configured secrets (negative control)', async () => {
    secretsEnv = 'whsec_connect,whsec_account'
    acceptedSecret = 'whsec_someone_else'

    const res = await POST(req())

    expect(res.status).toBe(400)
  })

  it('still verifies against a single secret', async () => {
    secretsEnv = 'whsec_only'
    acceptedSecret = 'whsec_only'

    expect((await POST(req())).status).toBe(200)
    expect(secretsTried).toEqual(['whsec_only'])
  })
})
