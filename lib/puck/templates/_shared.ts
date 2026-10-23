import type { Data } from '@measured/puck'
// Deep import on purpose: the barrel pulls in the generated files, and the codegen script
// that writes them imports these templates (bindings.ts has no generated imports).
import {
  cloneWithFreshIds,
  type TemplateBindings,
} from '@lms/core/src/page-builder/bindings'
import type { PageData } from '@lms/core/src/page-builder/types'
import { withDefaultAnchors } from '../utils/section-style'
import { sectionSpacingDefaults } from '../utils/section-spacing'

export type { TemplateBindings }

/**
 * What a template is for. Mirrors the picker's page-type step: `home` is `/`, the rest live
 * under `/p/<slug>`. `course` and `product` templates are bound to one course / product
 * (`{{courseId}}` / `{{productId}}`), so the picker asks for it; `all` shows under every type.
 */
export type PageType =
  | 'all'
  | 'home'
  | 'about'
  | 'contact'
  | 'faq'
  | 'terms'
  | 'events'
  | 'course'
  | 'product'
  | 'pricing'

export interface PuckTemplate {
  /** Stable slug: `apply_template` / MCP `template_id` address templates by it. */
  id: string
  name: string
  description: string
  category: string
  puck_data: Data
  sort_order: number
  pageType: PageType
}

// LMS component types that use section spacing — these get the shared
// spacing defaults injected so vertical templates render with consistent
// vertical rhythm without repeating the spacing props on every block.
const SPACED_COMPONENTS = new Set([
  'FeaturesGrid', 'CourseGrid', 'TestimonialGrid', 'CtaBlock',
  'PricingTable', 'FaqAccordion', 'StatsCounter', 'ContactForm',
  // SocialProof is NOT spaced: it has no section fields (a strict validator rejects them).
  'LogoCloud', 'Banner', 'TeamGrid', 'ImageGallery',
  'StatsBand', 'AnimatedStats', 'CtaBanner', 'EnrollCta', 'CatalogBrowser',
  // Data-bound course blocks (WP3) and FaqSplit share the same section layer.
  'FaqSplit', 'CourseHero', 'CourseCurriculum', 'CourseOutcomes', 'CoursePricingCard',
  'ProductGrid', 'InstructorCard',
])

// Module-level counter for stable, unique build-time IDs. Real per-instance
// IDs are regenerated when a template is applied (see deepCloneWithFreshIds).
let idCounter = 0

/** Build a Puck content node with an auto-generated id + spacing defaults. */
export function c(type: string, props: Record<string, unknown>, id?: string) {
  const spacing = SPACED_COMPONENTS.has(type) ? sectionSpacingDefaults : {}
  return { type, props: { id: id || `${type}-tpl-${++idCounter}`, ...spacing, ...props } }
}

/**
 * Deep-clone a template's puck_data with fresh ids for every block (DropZone keys re-keyed
 * onto the new parents) and its binding tokens (`{{schoolName}}`, `{{year}}`, `{{logoUrl}}`,
 * `{{courseId}}`, `{{productId}}`) substituted; unbound tokens fall back to neutral values.
 * Delegates to `cloneWithFreshIds` in `@lms/core`.
 */
export function deepCloneWithFreshIds(data: Data, bindings?: TemplateBindings): Data {
  return cloneWithFreshIds(data as unknown as PageData, { bindings: bindings ?? {} }) as unknown as Data
}

/** Which entity a template must be bound to before it is useful. */
export interface TemplateBindingNeeds {
  course: boolean
  product: boolean
}

/**
 * Whether the template's blocks carry a `{{courseId}}` / `{{productId}}` token, i.e. the
 * picker should ask for a course / product before creating the page.
 */
export function templateBindingNeeds(data: Data): TemplateBindingNeeds {
  const json = JSON.stringify(data) ?? ''
  return {
    course: /\{\{\s*courseId\s*\}\}/.test(json),
    product: /\{\{\s*productId\s*\}\}/.test(json),
  }
}

/** Keep local template links on real sections. Cross-page links are selected from actual school pages. */
export function prepareTemplateLinks(templates: PuckTemplate[]): PuckTemplate[] {
  const aliases: Record<string, string[]> = { about: ['team', 'features'], results: ['testimonials'], instruments: ['courses', 'features'], levels: ['courses', 'features'], courses: ['catalog'], catalog: ['courses'] }
  const anchors = (template: PuckTemplate) => {
    const data = withDefaultAnchors(template.puck_data)
    return new Set([...data.content, ...Object.values(data.zones ?? {}).flat()].map((item) => item.props.anchorId).filter((id): id is string => typeof id === 'string' && !!id))
  }
  return templates.map((template) => {
    const local = anchors(template)
    const target = (href: string): string | undefined => {
      if (href === '/terms' || href === '/privacy') return undefined
      if (!href.startsWith('#') || href === '#') return href
      const requested = href.slice(1)
      const candidates = [requested, ...(aliases[requested] ?? [])]
      const samePage = candidates.find((candidate) => local.has(candidate))
      if (samePage) return `#${samePage}`
      return undefined
    }
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.filter((item) => !(item && typeof item === 'object' && 'href' in item && typeof item.href === 'string' && target(item.href) === undefined)).map(visit).filter((item) => !(item && typeof item === 'object' && 'links' in item && Array.isArray(item.links) && item.links.length === 0))
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'string' && /(?:href|url)$/i.test(key) && item.startsWith('#') ? target(item) ?? '' : visit(item)]))
    }
    return { ...template, puck_data: visit(template.puck_data) as Data }
  })
}
