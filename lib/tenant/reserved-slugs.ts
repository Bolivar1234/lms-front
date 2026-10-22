/**
 * School slugs that can never be a tenant.
 *
 * Schools live at `<slug>.<NEXT_PUBLIC_PLATFORM_DOMAIN>`. When that domain is a
 * shared root such as `saythanks.org`, the same level also holds the platform's
 * own hosts (`www`, `api`, `staging`…), so a school must not be able to claim
 * one. The same list is enforced in the database by
 * `supabase/migrations/20261022000000_tenant_slug_reserved.sql`; a unit test
 * keeps the two in step.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'api-staging',
  'app',
  'assets',
  'auth',
  'billing',
  'blog',
  'cdn',
  'circles',
  'dashboard',
  'docs',
  'ftp',
  'help',
  'login',
  'mail',
  'mx',
  'ns1',
  'ns2',
  'portal',
  'smtp',
  'staging',
  'static',
  'status',
  'support',
  'webmail',
  'www',
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase())
}
