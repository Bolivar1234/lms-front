/** Public school-page URL shared by the app and MCP. */
export function landingPageUrl(slug: string): string {
  return slug === 'home' ? '/' : `/p/${encodeURIComponent(slug)}`
}
