import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { tenantSlugFromHostname } from '@/lib/tenant/host'
import { isReservedSlug, RESERVED_SLUGS } from '@/lib/tenant/reserved-slugs'

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PLATFORM_HOSTS
})

describe('tenantSlugFromHostname on a shared root domain', () => {
  const root = 'saythanks.org'

  it('uses the school slug as the subdomain', () => {
    expect(tenantSlugFromHostname('e2e-school.saythanks.org', root)).toBe('e2e-school')
    expect(tenantSlugFromHostname('E2E-School.saythanks.org:443', root)).toBe('e2e-school')
  })

  it('is not a school on the bare root, localhost or a nested host', () => {
    expect(tenantSlugFromHostname('saythanks.org', root)).toBeNull()
    expect(tenantSlugFromHostname('localhost:3000', root)).toBeNull()
    expect(tenantSlugFromHostname('a.b.saythanks.org', root)).toBeNull()
    expect(tenantSlugFromHostname('school.example.com', root)).toBeNull()
  })

  it('does not treat reserved platform labels as schools', () => {
    for (const label of ['www', 'api', 'api-staging', 'staging', 'circles']) {
      expect(tenantSlugFromHostname(`${label}.saythanks.org`, root)).toBeNull()
    }
  })

  it('does not treat listed platform hosts as schools', () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOSTS = 'lms.saythanks.org, home.saythanks.org'
    expect(tenantSlugFromHostname('lms.saythanks.org', root)).toBeNull()
    expect(tenantSlugFromHostname('home.saythanks.org', root)).toBeNull()
    expect(tenantSlugFromHostname('real-school.saythanks.org', root)).toBe('real-school')
  })

  it('keeps the legacy circles domain working', () => {
    expect(tenantSlugFromHostname('e2e-school.circles.saythanks.org', 'circles.saythanks.org')).toBe('e2e-school')
    expect(tenantSlugFromHostname('circles.saythanks.org', 'circles.saythanks.org')).toBeNull()
  })
})

describe('reserved slugs', () => {
  it('matches case-insensitively and ignores padding', () => {
    expect(isReservedSlug(' WWW ')).toBe(true)
    expect(isReservedSlug('e2e-school')).toBe(false)
  })

  it('is the same list the database constraint enforces', () => {
    const sql = readFileSync('supabase/migrations/20261022000000_tenant_slug_reserved.sql', 'utf8')
    const array = sql.match(/ARRAY\[([\s\S]*?)\]/)?.[1] ?? ''
    const inSql = [...array.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...RESERVED_SLUGS].sort())
  })
})
