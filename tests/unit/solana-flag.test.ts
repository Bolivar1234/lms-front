import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSolanaEnabled, solanaDisabledResponse } from '@/lib/payments/solana-flag'
import { getPaymentProvider } from '@/lib/payments'

afterEach(() => vi.unstubAllEnvs())

describe('Solana kill-switch', () => {
  it('is off unless SOLANA_PAYMENTS_ENABLED is exactly "true"', () => {
    for (const value of ['', 'false', '1', 'TRUE', 'yes']) {
      vi.stubEnv('SOLANA_PAYMENTS_ENABLED', value)
      expect(isSolanaEnabled(), value).toBe(false)
    }
    vi.stubEnv('SOLANA_PAYMENTS_ENABLED', 'true')
    expect(isSolanaEnabled()).toBe(true)
  })

  it('route guard answers 404 when disabled and lets the request through when enabled', async () => {
    vi.stubEnv('SOLANA_PAYMENTS_ENABLED', 'false')
    const blocked = solanaDisabledResponse()
    expect(blocked?.status).toBe(404)

    vi.stubEnv('SOLANA_PAYMENTS_ENABLED', 'true')
    expect(solanaDisabledResponse()).toBeNull()
  })

  it('the provider registry refuses both Solana providers when disabled', () => {
    vi.stubEnv('SOLANA_PAYMENTS_ENABLED', 'false')
    expect(() => getPaymentProvider('solana')).toThrow(/disabled/i)
    expect(() => getPaymentProvider('solana_subs')).toThrow(/disabled/i)
  })
})
