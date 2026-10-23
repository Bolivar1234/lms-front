import { describe, expect, it } from 'vitest'
import { puckConfig } from '@/lib/puck/config'
import { PAGE_BUILDER_MANIFEST, pageCatalog } from '@lms/core'
import { PUCK_TEMPLATES } from '@/lib/puck/templates'
import { withDefaultAnchors } from '@/lib/puck/utils/section-style'
import { landingPageUrl } from '@/lib/puck/utils/page-url'

const targets = [
  ['Header', 'logo'], ['Image', 'src'], ['Section', 'backgroundImage'], ['HeroBlock', 'backgroundImage'], ['ContentFeature', 'imageUrl'],
  ['ImageGallery', 'images', 'src'], ['LogoCloud', 'items', 'src'], ['LogoMarquee', 'items', 'src'], ['TeamGrid', 'members', 'avatar'],
] as const

describe('Puck upload fields keep their persisted string contracts', () => {
  for (const [component, name, child] of targets) it(`${component} ${name} has an upload control and a text schema`, () => {
    const fields = puckConfig.components[component].fields as Record<string, { type: string; arrayFields?: Record<string, { type: string }> }>
    const field = child ? fields[name].arrayFields![child] : fields[name]
    expect(field.type).toBe('custom')
    const manifest = PAGE_BUILDER_MANIFEST.components[component].fields as typeof fields
    expect((child ? manifest[name].arrayFields![child] : manifest[name]).type).toBe('text')
  })

  it('root share image has an upload control without changing the saved URL value', () => {
    expect(puckConfig.root?.fields?.ogImage.type).toBe('custom')
    const data = { root: { props: { ogImage: 'https://cdn.example/share.webp' } }, content: [] }
    expect(pageCatalog.validatePage(data).errors).toEqual([])
  })

  it('navigation page pickers keep plain string hrefs', () => {
    expect(puckConfig.components.Header.fields?.navLinks).toMatchObject({ arrayFields: { href: { type: 'custom' } } })
    expect(PAGE_BUILDER_MANIFEST.components.Header.fields.navLinks).toMatchObject({ arrayFields: { href: { type: 'text' } } })
    expect(landingPageUrl('home')).toBe('/')
    expect(landingPageUrl('about')).toBe('/p/about')
    expect(landingPageUrl('pricing')).toBe('/p/pricing')
  })
})

describe('new template navigation', () => {
  it('contains no dead platform legal routes and every local anchor has a real section', () => {
    for (const template of PUCK_TEMPLATES) {
      const data = withDefaultAnchors(template.puck_data)
      const ids = new Set([...data.content, ...Object.values(data.zones ?? {}).flat()].map((item) => item.props.anchorId).filter(Boolean))
      const walk = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(walk); return }
        if (!value || typeof value !== 'object') return
        for (const [key, item] of Object.entries(value)) {
          if (typeof item === 'string' && /(?:href|url)$/i.test(key)) {
            expect(['/terms', '/privacy'], `${template.id}: ${item}`).not.toContain(item)
            if (item.startsWith('#') && item !== '#') expect(ids.has(item.slice(1)), `${template.id}: missing ${item}`).toBe(true)
          }
          walk(item)
        }
      }
      walk(template.puck_data)
    }
  })
})
