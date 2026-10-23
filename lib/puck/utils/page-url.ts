/** Public URLs for saved school pages. English routes never carry a locale segment. */
export { landingPageUrl } from '@lms/core/src/page-builder/page-url'

/** Existing catalog and commerce routes are distinct from custom /p/ pages. */
export const BUILT_IN_PAGE_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Course catalog', href: '/courses' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Sign in', href: '/auth/login' },
] as const
