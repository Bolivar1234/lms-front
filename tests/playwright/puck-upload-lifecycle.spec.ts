/** Real local auth, Server Actions and Storage. Interception only delays the real upload response. */
import { createClient } from '@supabase/supabase-js'
import { PAGE_BUILDER_MANIFEST } from '@lms/core'
import sharp from 'sharp'
import { expect, test as base, type Locator, type Page, type Request, type Route } from './utils/test'
import { loginAsAdmin } from './utils/auth'
import { TENANT_BASE } from './utils/constants'
import { CODE_ACADEMY_TENANT } from './utils/seed-state'

const IMAGE = 'Image-upload-primary'
const OTHER_IMAGE = 'Image-upload-other'
const GALLERY = 'ImageGallery-upload-race'
const SECTION = 'Section-upload-moves'
const COLUMNS = 'Columns-upload-moves'
const HEADER = 'Header-upload-links'
const SECTION_CHILDREN = ['Image-section-first', 'Image-section-second']
const COLUMN_CHILDREN = ['Image-column-first', 'Image-column-second']
const SELECTED = '[data-puck-overlay][class*="--isSelected"]'
const ARRAY_SUMMARY = '[class*="_ArrayFieldItem-summary_"]'

/** Fixture writes must never target a connected/hosted project. No env-based silent skips. */
function localClient() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw || !key) throw new Error('Puck browser fixtures require local Supabase URL and service key.')
  const database = new URL(raw)
  const app = new URL(TENANT_BASE)
  const loopback = (hostname: string) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)
  if (!loopback(database.hostname)) throw new Error('Refusing hosted Supabase fixture writes: use a local loopback URL.')
  if (!loopback(app.hostname) && app.hostname !== 'lvh.me' && !app.hostname.endsWith('.lvh.me')) throw new Error('Puck browser tests require a local app origin.')
  return createClient(raw, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function image(id: string) {
  return { type: 'Image', props: { id, src: '', alt: '', width: '100%', height: '80px', objectFit: 'contain', borderRadius: 'school' } }
}

function initialData() {
  return {
    root: { props: {} },
    content: [
      image(IMAGE), image(OTHER_IMAGE),
      { type: 'ImageGallery', props: { id: GALLERY, title: 'Upload race gallery', images: [{ src: '', alt: '', caption: '' }, { src: '', alt: '', caption: '' }], columns: '2' } },
      { type: 'Section', props: { id: SECTION, backgroundColor: '', backgroundImage: '', backgroundGradient: '', overlayOpacity: 0, paddingY: '2rem', maxWidth: '1280px', theme: 'light' } },
      { type: 'Columns', props: { id: COLUMNS, columnCount: '2', gap: '1rem', verticalAlign: 'top', stackOnMobile: true } },
      { type: 'Header', props: { id: HEADER, logo: '', logoText: 'Fixture navigation', navLinks: [{ label: 'Target', href: '/courses' }], ctaLabel: '', ctaHref: '', showLogin: false, showLanguageSwitcher: false, sticky: false, transparent: false } },
    ],
    zones: { [`${SECTION}:content`]: SECTION_CHILDREN.map(image), [`${COLUMNS}:col-1`]: COLUMN_CHILDREN.map(image), [`${COLUMNS}:col-2`]: [] },
  }
}

type SavedBlock = { type: string; props: Record<string, unknown> & { id: string } }
type SavedData = { root: { props: Record<string, unknown> }; content: SavedBlock[]; zones: Record<string, SavedBlock[]> }
interface Fixture {
  id: string
  title: string
  targetTitle: string
  targetSlug: string
  uploadedPaths: Set<string>
  read: () => Promise<SavedData>
  replace: (data: SavedData) => Promise<void>
}

const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use, info) => {
    const admin = localClient()
    const suffix = `${info.workerIndex}-${crypto.randomUUID().slice(0, 10)}`
    const title = `[E2E] Puck uploads ${suffix}`
    const targetTitle = `[E2E] Link target ${suffix}`
    const targetSlug = `e2e-puck-target-${suffix}`
    const uploadedPaths = new Set<string>()
    const { data, error } = await admin.from('landing_pages').insert([
      { tenant_id: CODE_ACADEMY_TENANT, title, slug: `e2e-puck-upload-${suffix}`, is_published: false, puck_data: initialData() },
      { tenant_id: CODE_ACADEMY_TENANT, title: targetTitle, slug: targetSlug, is_published: false, puck_data: { root: { props: {} }, content: [], zones: {} } },
    ]).select('page_id,title')
    if (error || !data) throw new Error(`Could not create local Puck fixtures: ${error?.message}`)
    const ids = data.map((row) => row.page_id as string)
    const id = data.find((row) => row.title === title)!.page_id as string
    try {
      await loginAsAdmin(page)
      await openFixture(page, title)
      const aiToggle = page.getByTestId('page-architect-toggle')
      if (await aiToggle.count() && await aiToggle.getAttribute('aria-pressed') === 'true') await aiToggle.click()
      await use({ id, title, targetTitle, targetSlug, uploadedPaths, read: async () => {
        const result = await admin.from('landing_pages').select('puck_data').eq('page_id', id).eq('tenant_id', CODE_ACADEMY_TENANT).single()
        if (result.error) throw result.error
        return result.data.puck_data as SavedData
      }, replace: async (puckData) => {
        const result = await admin.from('landing_pages').update({ puck_data: puckData }).eq('page_id', id).eq('tenant_id', CODE_ACADEMY_TENANT)
        if (result.error) throw result.error
      } })
    } finally {
      if (uploadedPaths.size) {
        const removed = await admin.storage.from('landing-page-assets').remove([...uploadedPaths])
        if (removed.error) throw new Error(`Could not clean local upload fixtures: ${removed.error.message}`)
      }
      const deleted = await admin.from('landing_pages').delete().in('page_id', ids).eq('tenant_id', CODE_ACADEMY_TENANT)
      if (deleted.error) throw deleted.error
    }
  },
})

test.use({ viewport: { width: 1440, height: 1000 } })
test.describe.configure({ timeout: 180_000 })

async function openFixture(page: Page, title: string) {
  await page.goto(`${TENANT_BASE}/dashboard/admin/landing-page`, { waitUntil: 'domcontentloaded' })
  const row = page.locator('tr', { hasText: title })
  await expect(row).toBeVisible({ timeout: 60_000 })
  for (let attempt = 0; attempt < 4 && !(await page.locator(`[data-puck-component="${IMAGE}"]`).count()); attempt++) {
    await row.evaluate((element) => (element as HTMLElement).click())
    await page.locator(`[data-puck-component="${IMAGE}"]`).waitFor({ timeout: 20_000 }).catch(() => undefined)
  }
  await expect(page.locator(`[data-puck-component="${IMAGE}"]`)).toBeVisible({ timeout: 30_000 })
}

async function select(page: Page, id: string) {
  const component = page.locator(`[data-puck-component="${id}"]`)
  await component.scrollIntoViewIfNeeded()
  await component.evaluate((element) => (element as HTMLElement).click())
  await expect(page.locator(SELECTED)).toHaveCount(1)
}

function field(page: Page, name: string) {
  return page.locator(`[data-upload-field="${name}"]`)
}

async function raster(name: string) {
  return { name, mimeType: 'image/png', buffer: await sharp({ create: { width: 8, height: 8, channels: 4, background: '#336699' } }).png().toBuffer() }
}

function collectUploadedPaths(body: string, fixture: Fixture) {
  for (const path of body.match(new RegExp(`${CODE_ACADEMY_TENANT}/images/[A-Za-z0-9_-]+\\.webp`, 'g')) ?? []) fixture.uploadedPaths.add(path)
}

function isUploadRequest(request: Request) {
  return request.method() === 'POST'
    && new URL(request.url()).pathname === '/dashboard/admin/landing-page'
    && !!request.headers()['next-action']
    && !!request.headers()['content-type']?.startsWith('multipart/form-data;')
}

async function uploadImage(page: Page, fixture: Fixture, name: string, filename: string) {
  // Capture the actual action at the network boundary: Chromium can discard
  // streamed Server Action response bodies before response.text() reads them.
  let finish!: () => void
  let failure: unknown
  const uploaded = new Promise<void>((resolve) => { finish = resolve })
  const capture = async (route: Route) => {
    if (!isUploadRequest(route.request())) return route.continue()
    try {
      const result = await route.fetch()
      const body = await result.text()
      expect(result.ok()).toBe(true)
      expect(body).toContain('/storage/v1/object/public/landing-page-assets/')
      const previousCount = fixture.uploadedPaths.size
      collectUploadedPaths(body, fixture)
      expect(fixture.uploadedPaths.size).toBe(previousCount + 1)
      await route.fulfill({ response: result })
    } catch (error) {
      failure = error
      await route.abort().catch(() => undefined)
    } finally { finish() }
  }
  await page.route('**/dashboard/admin/landing-page', capture)
  try {
    await field(page, name).locator('input[type=file]').setInputFiles(await raster(filename))
    await uploaded
    if (failure) throw failure
  } finally { await page.unroute('**/dashboard/admin/landing-page', capture) }
  await expect(field(page, name).getByRole('textbox')).toHaveValue(/\/storage\/v1\/object\/public\/landing-page-assets\//, { timeout: 30_000 })
  const url = await field(page, name).getByRole('textbox').inputValue()
  expect(new URL(url).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/)
  await expect.poll(() => field(page, name).getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(8)
  return url
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('editor-dirty')).toHaveCount(0, { timeout: 30_000 })
}

/** The actual server upload finishes before we hold its response; no synthetic success body. */
async function delayUpload(page: Page, fixture: Fixture) {
  let release!: () => void
  let uploaded!: () => void
  let delivered!: () => void
  let failure: unknown
  const gate = new Promise<void>((resolve) => { release = resolve })
  const ready = new Promise<void>((resolve) => { uploaded = resolve })
  const completed = new Promise<void>((resolve) => { delivered = resolve })
  await page.route('**/dashboard/admin/landing-page', async (route) => {
    const request = route.request()
    if (!isUploadRequest(request)) return route.continue()
    try {
      const response = await route.fetch()
      const body = await response.text()
      collectUploadedPaths(body, fixture)
      expect(response.ok()).toBe(true)
      expect(body).toContain('/storage/v1/object/public/landing-page-assets/')
      uploaded()
      await gate
      await route.fulfill({ response })
      delivered()
    } catch (error) {
      failure = error
      uploaded()
      await route.abort().catch(() => undefined)
      delivered()
    }
  })
  return {
    wait: async () => { await ready; if (failure) throw failure },
    release,
    settle: async () => {
      await completed
      if (failure) throw failure
      // The browser has the genuine response; allow its React action continuation to commit.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    },
  }
}

async function galleryItems(page: Page) {
  await select(page, GALLERY)
  const summaries = page.locator(ARRAY_SUMMARY)
  await expect(summaries).toHaveCount(2)
  await summaries.first().click()
  await expect(field(page, 'images[0].src')).toBeVisible()
  return summaries
}

function topLevelIds(page: Page) {
  return page.locator('[data-puck-component]').evaluateAll((elements) => elements.filter((element) => !element.parentElement?.closest('[data-puck-component]')).map((element) => element.getAttribute('data-puck-component')))
}

function childIds(page: Page, parent: string) {
  return page.locator(`[data-puck-component="${parent}"] [data-puck-component]`).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-puck-component')))
}

async function dragSummary(page: Page, source: Locator, destination: Locator) {
  await source.scrollIntoViewIfNeeded()
  const from = await source.boundingBox()
  const to = await destination.boundingBox()
  if (!from || !to) throw new Error('Gallery item drag handles are not visible.')
  // Move the compact second row above the expanded first row. Its whole sortable
  // item is much taller than its summary, so crossing just the lower summary is insufficient.
  const startX = from.x + from.width - 24
  await page.mouse.move(startX, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(startX, from.y + from.height / 2 - 12, { steps: 4 })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.mouse.move(to.x + to.width - 24, to.y + 2, { steps: 30 })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.mouse.up()
}

test('a real Puck image upload and page-picker link persist across save and reopen', async ({ page, fixture }) => {
  await select(page, IMAGE)
  const filename = `puck-real-${fixture.id}.png`
  const url = await uploadImage(page, fixture, 'src', filename)
  await select(page, HEADER)
  await page.locator(ARRAY_SUMMARY).first().click()
  await page.getByRole('combobox', { name: 'Choose a page' }).first().selectOption(`/p/${fixture.targetSlug}`)
  await save(page)
  await expect.poll(async () => {
    const data = await fixture.read()
    return { image: data.content.find((item) => item.props.id === IMAGE)?.props, header: data.content.find((item) => item.props.id === HEADER)?.props }
  }).toMatchObject({ image: { src: url }, header: { navLinks: [{ href: `/p/${fixture.targetSlug}` }] } })
  await openFixture(page, fixture.title)
  await select(page, IMAGE)
  await expect(field(page, 'src').getByRole('textbox')).toHaveValue(url)
})

test('move controls reorder the selected block at top level and inside Section and Columns', async ({ page, fixture }) => {
  await select(page, IMAGE)
  await expect(page.locator(SELECTED).getByRole('button', { name: 'Move up', exact: true })).toBeDisabled()
  await page.locator(SELECTED).getByRole('button', { name: 'Move down', exact: true }).click()
  await expect.poll(() => topLevelIds(page)).toEqual([OTHER_IMAGE, IMAGE, GALLERY, SECTION, COLUMNS, HEADER])
  for (const [parent, children] of [[SECTION, SECTION_CHILDREN], [COLUMNS, COLUMN_CHILDREN]] as const) {
    await select(page, children[0])
    await expect(page.locator(SELECTED).getByRole('button', { name: 'Move up', exact: true })).toBeDisabled()
    await page.locator(SELECTED).getByRole('button', { name: 'Move down', exact: true }).click()
    await expect.poll(() => childIds(page, parent)).toEqual([...children].reverse())
    await expect(page.locator(SELECTED).getByRole('button', { name: 'Move down', exact: true })).toBeDisabled()
  }
  await save(page)
  const data = await fixture.read()
  expect(data.content.slice(0, 2).map((item) => item.props.id)).toEqual([OTHER_IMAGE, IMAGE])
  expect(data.zones[`${SECTION}:content`].map((item) => item.props.id)).toEqual([...SECTION_CHILDREN].reverse())
  expect(data.zones[`${COLUMNS}:col-1`].map((item) => item.props.id)).toEqual([...COLUMN_CHILDREN].reverse())
})

test('deleting an empty gallery item ignores its delayed real upload without writing the replacement item', async ({ page, fixture }) => {
  const summaries = await galleryItems(page)
  const filename = `puck-delete-${fixture.id}.png`
  const delayed = await delayUpload(page, fixture)
  try {
    await field(page, 'images[0].src').locator('input[type=file]').setInputFiles(await raster(filename))
    await delayed.wait()
    await summaries.first().getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(summaries).toHaveCount(1)
  } finally { delayed.release() }
  await delayed.settle()
  await summaries.first().click()
  await expect(field(page, 'images[0].src').getByRole('textbox')).toHaveValue('')
  await save(page)
  const data = await fixture.read()
  expect(data.content.find((item) => item.props.id === GALLERY)?.props).toMatchObject({ images: [{ src: '', alt: '', caption: '' }] })
})

test('reordering wholly identical gallery items cancels the delayed upload by item identity', async ({ page, fixture }) => {
  const summaries = await galleryItems(page)
  const filename = `puck-reorder-${fixture.id}.png`
  const delayed = await delayUpload(page, fixture)
  try {
    await field(page, 'images[0].src').locator('input[type=file]').setInputFiles(await raster(filename))
    await delayed.wait()
    await dragSummary(page, summaries.last(), summaries.first())
    await expect(summaries).toHaveCount(2)
    await expect(summaries).toHaveText([/Item #1/, /Item #0/])
  } finally { delayed.release() }
  await delayed.settle()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('editor-dirty')).toHaveCount(0, { timeout: 30_000 })
  const data = await fixture.read()
  expect(data.content.find((item) => item.props.id === GALLERY)?.props).toMatchObject({ images: [{ src: '' }, { src: '' }] })
})

test('deleting an image block ignores a late upload after another empty image becomes selected', async ({ page, fixture }) => {
  await select(page, IMAGE)
  const filename = `puck-block-delete-${fixture.id}.png`
  const delayed = await delayUpload(page, fixture)
  try {
    await field(page, 'src').locator('input[type=file]').setInputFiles(await raster(filename))
    await delayed.wait()
    await page.locator(SELECTED).getByRole('button', { name: 'Delete', exact: true }).click()
    await select(page, OTHER_IMAGE)
  } finally { delayed.release() }
  await delayed.settle()
  await expect(field(page, 'src').getByRole('textbox')).toHaveValue('')
  await save(page)
  const data = await fixture.read()
  expect(data.content.some((item) => item.props.id === IMAGE)).toBe(false)
  expect(data.content.find((item) => item.props.id === OTHER_IMAGE)?.props).toMatchObject({ src: '' })
})

test('remaining Puck image fields and the page share image upload, save, and reopen', async ({ page, fixture }) => {
  const extraBlocks: SavedBlock[] = [
    { type: 'HeroBlock', props: { ...PAGE_BUILDER_MANIFEST.components.HeroBlock.defaultProps, id: 'HeroBlock-upload-surfaces', minHeight: '100px' } },
    { type: 'ContentFeature', props: { ...PAGE_BUILDER_MANIFEST.components.ContentFeature.defaultProps, id: 'ContentFeature-upload-surfaces', imageUrl: '' } },
    { type: 'LogoCloud', props: { ...PAGE_BUILDER_MANIFEST.components.LogoCloud.defaultProps, id: 'LogoCloud-upload-surfaces', items: [{ src: '', alt: 'Cloud fixture', url: '' }] } },
    { type: 'LogoMarquee', props: { ...PAGE_BUILDER_MANIFEST.components.LogoMarquee.defaultProps, id: 'LogoMarquee-upload-surfaces', items: [{ src: '', alt: 'Marquee fixture', url: '' }] } },
    { type: 'TeamGrid', props: { ...PAGE_BUILDER_MANIFEST.components.TeamGrid.defaultProps, id: 'TeamGrid-upload-surfaces', source: 'manual', members: [{ name: 'Fixture teacher', role: '', bio: '', avatar: '' }] } },
  ]
  const data: SavedData = initialData()
  data.content.push(...extraBlocks)
  await fixture.replace(data)
  await openFixture(page, fixture.title)

  const surfaces = [
    { id: HEADER, name: 'logo', expected: (url: string) => ({ logo: url }) },
    { id: SECTION, name: 'backgroundImage', expected: (url: string) => ({ backgroundImage: url }) },
    { id: GALLERY, name: 'images[0].src', expected: (url: string) => ({ images: [{ src: url }, { src: '' }] }), array: true },
    { id: 'HeroBlock-upload-surfaces', name: 'backgroundImage', expected: (url: string) => ({ backgroundImage: url }) },
    { id: 'ContentFeature-upload-surfaces', name: 'imageUrl', expected: (url: string) => ({ imageUrl: url }) },
    { id: 'LogoCloud-upload-surfaces', name: 'items[0].src', expected: (url: string) => ({ items: [{ src: url }] }), array: true },
    { id: 'LogoMarquee-upload-surfaces', name: 'items[0].src', expected: (url: string) => ({ items: [{ src: url }] }), array: true },
    { id: 'TeamGrid-upload-surfaces', name: 'members[0].avatar', expected: (url: string) => ({ members: [{ avatar: url }] }), array: true },
  ]
  const urls = new Map<string, string>()
  for (const surface of surfaces) {
    await select(page, surface.id)
    if (surface.array) await page.locator(ARRAY_SUMMARY).first().click()
    urls.set(surface.id, await uploadImage(page, fixture, surface.name, `puck-${surface.id}-${fixture.id}.png`))
  }
  await page.locator('[data-puck-preview]').evaluate((element) => (element as HTMLElement).click())
  await expect(page.locator(SELECTED)).toHaveCount(0)
  const shareImage = await uploadImage(page, fixture, 'ogImage', `puck-share-${fixture.id}.png`)
  await save(page)

  const saved = await fixture.read()
  for (const surface of surfaces) {
    expect(saved.content.find((item) => item.props.id === surface.id)?.props).toMatchObject(surface.expected(urls.get(surface.id)!))
  }
  expect(saved.root.props.ogImage).toBe(shareImage)
  await openFixture(page, fixture.title)
  for (const surface of surfaces) {
    await select(page, surface.id)
    if (surface.array && !await field(page, surface.name).isVisible()) await page.locator(ARRAY_SUMMARY).first().click()
    await expect(field(page, surface.name).getByRole('textbox')).toHaveValue(urls.get(surface.id)!)
  }
  await page.locator('[data-puck-preview]').evaluate((element) => (element as HTMLElement).click())
  await expect(field(page, 'ogImage').getByRole('textbox')).toHaveValue(shareImage)
})
