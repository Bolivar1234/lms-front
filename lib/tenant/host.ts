import { RESERVED_SLUGS } from '@/lib/tenant/reserved-slugs'

const LOCAL_HOSTS = ['localhost', '127.0.0.1']

/**
 * Hosts under the platform domain that belong to the platform, not a school
 * (comma-separated, e.g. `circles.saythanks.org`). Needed when the platform
 * domain is a shared root: `circles.saythanks.org` is the LMS home page there,
 * not a school called "circles".
 */
function platformHosts(): string[] {
  return (process.env.NEXT_PUBLIC_PLATFORM_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase().split(':')[0])
    .filter(Boolean)
}

/**
 * The school slug in `hostname`, or `null` when the host is the platform
 * itself: localhost, the bare platform domain, a listed platform host, a
 * reserved label, or a host outside the platform domain.
 *
 * `school.saythanks.org` -> `school` (platform domain `saythanks.org`)
 * `school.lvh.me:3000`   -> `school` (platform domain `lvh.me`)
 */
export function tenantSlugFromHostname(hostname: string, platformDomain: string): string | null {
  const host = hostname.split(':')[0].toLowerCase()
  if (LOCAL_HOSTS.includes(host) || host === platformDomain || platformHosts().includes(host)) {
    return null
  }
  if (!host.endsWith(`.${platformDomain}`)) return null

  const slug = host.slice(0, -(platformDomain.length + 1))
  if (!slug || slug.includes('.') || RESERVED_SLUGS.has(slug)) return null
  return slug
}
