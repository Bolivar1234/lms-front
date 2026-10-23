import { describe, expect, it } from 'vitest'
import { landingPageUrl } from '@lms/core'
import { publicPath } from './preview.js'

describe('MCP public school page URLs', () => {
  it.each(['home', 'about', 'pricing', 'catalog', 'my-course', 'hello world'])('shares the app URL mapper for %s', (slug) => {
    expect(publicPath(slug)).toBe(landingPageUrl(slug))
    expect(publicPath(slug)).not.toMatch(/^\/(en|es)(\/|$)/)
  })
  it('keeps custom page slugs separate from the built-in commerce/catalog routes', () => {
    expect(publicPath('home')).toBe('/')
    expect(publicPath('pricing')).toBe('/p/pricing')
    expect(publicPath('catalog')).toBe('/p/catalog')
    expect(publicPath('hello world')).toBe('/p/hello%20world')
  })
})
