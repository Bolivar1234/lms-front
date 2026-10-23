'use client'

import { createContext, useContext } from 'react'
import type { CustomField } from '@measured/puck'
import { useLandingCourses } from '../../utils/courses-context'
import { useLandingProducts } from '../../utils/landing-pickers-context'
import { BUILT_IN_PAGE_LINKS, landingPageUrl } from '../../utils/page-url'
import { Input } from '@/components/ui/input'

export type LandingPageLink = { id: string; name: string; slug: string; status: 'draft' | 'published' }
export const LandingPageLinksContext = createContext<LandingPageLink[]>([])

function PageLinkField({ value, onChange, id, readOnly }: Parameters<CustomField<string>['render']>[0]) {
  const pages = useContext(LandingPageLinksContext)
  const courses = useLandingCourses()
  const products = useLandingProducts()
  const groups = [
    { label: 'School pages', options: pages.map((page) => ({ key: page.id, label: `${page.name}${page.status === 'draft' ? ' (draft)' : ''}`, href: landingPageUrl(page.slug) })) },
    { label: 'Standard pages', options: BUILT_IN_PAGE_LINKS.map((page) => ({ ...page, key: page.href })) },
    { label: 'Courses', options: courses.map((course) => ({ key: course.id, label: course.title, href: `/courses/${encodeURIComponent(course.id)}` })) },
    { label: 'Products', options: products.map((product) => ({ key: product.id, label: product.name, href: product.href })) },
  ]
  const options = groups.flatMap((group) => group.options)
  return <div className="space-y-2">
    <select aria-label="Choose a page" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={options.some((page) => page.href === value) ? value : ''} disabled={readOnly} onChange={(event) => { if (event.target.value) onChange(event.target.value) }}>
      <option value="">Choose a page…</option>
      {groups.map((group) => group.options.length > 0 && <optgroup key={group.label} label={group.label}>{group.options.map((page) => <option key={page.key} value={page.href}>{page.label}</option>)}</optgroup>)}
    </select>
    <Input id={id} aria-label="Link URL" value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={readOnly} placeholder="Or paste a URL, /path or #section" />
  </div>
}

export function pageLinkField(label: string): CustomField<string> & { valueType: 'string' } {
  return { type: 'custom', label, valueType: 'string', render: PageLinkField }
}
