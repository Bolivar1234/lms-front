# Audit: image uploads, storage security, page links and the locale prefix

## Reconstruction update — 2026-10-22

The findings below describe the starting checkout and are retained as historical
context. The missing earlier remediation archive could not be recovered; the
owner authorized reconstruction against `cff63f96`. The current working tree
implements the 16 audited upload surfaces:

| Surfaces | Current implementation |
| --- | --- |
| Branding logo and favicon (2) | Shared upload/preview field with URL input and server-side file validation |
| Puck header logo, image, section/hero backgrounds, feature image, gallery, logo cloud, logo marquee, team avatar, page social image (10) | Upload-aware custom fields with page-editor lifecycle tracking |
| Product wizard course thumbnail (1) | Authorized course-image upload with URL input |
| Lesson audio, vocabulary audio, downloadable file (3) | Authorized private lesson resources persisted as durable references; signed access resolved and renewed when viewed |

Additional reconstruction includes own-user avatar editing, page selectors, a
shared home/page URL mapper used by the app and MCP package, template link
repairs, selected-block move controls, and cancellation/cleanup of delayed editor
uploads. Vocabulary serialization retains supported properties and multiline
elements. Audio renewal preserves playback position while a new source loads.

Migrations `20261022120000_storage_security_hardening.sql` and
`20261022121000_private_lesson_media_and_avatars.sql` remove the exact surviving
open storage policies, track bucket settings, restrict public image types, and
provide private-media/avatar/account-cleanup support. Authorized privileged
uploads retain their application checks; payment-proof prefixes and public
certificate paths remain compatible. Community mobile media MIME variants are
included. Lesson audio/downloads use private `lesson-resources`; public SVG
uploads are rejected. A general media library, onboarding redesign, and removal
of the unused product form are outside this reconstruction.

English browser URLs are unprefixed; internal `[locale]` routes remain. See
[LOCALE_REMOVAL_ANALYSIS.md](LOCALE_REMOVAL_ANALYSIS.md) for the presentation
contract. The separate previously blocked routing-normalization investigation
was not resumed.

The current verification outcomes and remaining production/devnet/TypeScript
boundaries are recorded in
[AUDIT_REMEDIATION_STATUS.md](AUDIT_REMEDIATION_STATUS.md). Authenticated browser
assertions, Storage API controls, isolated unit tests, and production deployment
state are reported separately there. Nothing in the historical findings below
establishes current production drift.

## Original audit

Date: 2026-10-22. Status: findings only, no code changed. Findings come from reading the code and
migrations plus one local Playwright run; production was not inspected (no sign-in to the live
site, Supabase MCP offline).

Schools can't upload their own logo, favicon or page-builder images: 16 fields only take a pasted
URL, even though an unused upload action for exactly this already exists. The audit also found that
four storage buckets let any logged-in user write to them. One of those, `payment-proofs`, is
critical: any user can read every school's payment proofs. Fix the storage policies before adding
upload buttons.

## URL-only fields

16 live fields ask for a pasted media URL and offer no upload; the last three rows are related gaps.
Video and generic embed fields are left out, since a YouTube/Vimeo/iframe URL is the right input
there.

| Area | Field | Who sees it | Used for | File |
| --- | --- | --- | --- | --- |
| Branding | `logo_url` | Admin | School logo in the header and on the public school page. No other place sets it, and onboarding doesn't ask for it | `components/admin/branding-settings-form.tsx:56` |
| Branding | `favicon_url` | Admin | Browser tab icon | `components/admin/branding-settings-form.tsx:67` |
| Page builder | Header `logo` | Admin | Page header logo | `lib/puck/components/navigation/header.tsx:31` |
| Page builder | Image `src` | Admin | Image block | `lib/puck/components/primitives/image.tsx:32` |
| Page builder | Section `backgroundImage` | Admin | Section background | `lib/puck/components/layout/section.tsx:65` |
| Page builder | Hero `backgroundImage` | Admin | Hero background | `lib/puck/components/lms/hero-block.tsx:49` |
| Page builder | Content feature `imageUrl` | Admin | Image beside feature text | `lib/puck/components/lms/content-feature.tsx:32` |
| Page builder | Gallery `images[].src` | Admin | Gallery items | `lib/puck/components/lms/image-gallery.tsx:31` |
| Page builder | Logo cloud `logos[].src` | Admin | Partner logos | `lib/puck/components/lms/logo-cloud.tsx:24` |
| Page builder | Logo marquee `logos[].src` | Admin | Scrolling logos | `lib/puck/components/lms/logo-marquee.tsx:41` |
| Page builder | Team grid `members[].avatar` | Admin | Team photos | `lib/puck/components/lms/team-grid.tsx:47` |
| Page builder | Page `ogImage` | Admin | Social share image | `lib/puck/utils/root-meta.ts:26` |
| Products | Wizard `course.thumbnailUrl` | Admin | Thumbnail of a course created inside the product wizard. The course form beside it already has upload | `components/admin/product-creation-wizard.tsx:599` |
| Lessons | Audio block `src` | Teacher | Lesson audio. The editor itself warns that hosted URLs expire | `components/teacher/block-editor/editors/audio-block.tsx:23` |
| Lessons | Vocabulary `audioUrl` | Teacher | Pronunciation audio | `components/teacher/block-editor/editors/vocabulary-block.tsx:34` |
| Lessons | File download `url` | Teacher | Downloadable file in a lesson | `components/teacher/block-editor/editors/file-download-block.tsx:23` |
| Products (dead) | `image` | n/a | `ProductForm` is never imported, so it is safe to delete | `components/admin/product-form.tsx:243` |
| Profiles | Avatar | Student / teacher | No avatar editing at all, by URL or upload. Avatars are only displayed | `components/student/profile-form.tsx` |
| Profiles | Team grid prefill | Admin | Uses the teacher's `avatar_url`, which no one can set | `lib/puck/components/lms/team-grid.tsx:81` |

Already done right (upload plus URL fallback): course thumbnail (`course-form.tsx:285`), lesson image
(`lesson-details-step.tsx:111`), lesson image block (`image-block.tsx:63`), certificate logo and
signature, community posts.

## Storage security

Four of the eight buckets let any logged-in user (including a student at another school) write to
them through the Supabase storage API, bypassing the app's server-action checks. One of those four,
`payment-proofs`, also lets any logged-in user read every school's files. The app itself uploads
safely; the gaps are in RLS, so a direct API call gets past them. This is the repo's migration state;
production policies were not checked.

| Bucket | Public | Who can write / delete (final RLS) | Risk | Severity | Evidence |
| --- | --- | --- | --- | --- | --- |
| `payment-proofs` | No | Any authenticated user can INSERT anywhere and SELECT everything | Cross-tenant read of every school's and student's payment proofs. No size/mime limit. The app uploads with the user-session client, so RLS is the only guard | Critical | `20260221010000_billing_proof_upload.sql:17-24`, `app/actions/admin/billing.ts:979`, `app/actions/payment-requests.ts:989` |
| `landing-page-assets` | Yes | Any authenticated user can INSERT and DELETE anywhere | Cross-tenant delete/replace of landing images and certificate logos/signatures. SVG allowed in a public bucket (stored XSS on the storage origin). Policy names say "Tenant admins", but the checks don't | High | `20260308210000_replace_landing_pages_with_puck.sql:52-79`, `app/actions/admin/landing-page-assets.ts:8`, `app/actions/admin/certificate-assets.ts:9` |
| `course-images` | Yes | Any authenticated user can INSERT and DELETE anywhere | Any student can delete or swap any school's course thumbnails | High | `20260716204823_course_images_bucket.sql:19-31` |
| `community-assets` | Yes | Any authenticated user can INSERT anywhere; DELETE only own folder | The fix migration drops policy names that never existed, so the open INSERT policy survives. Anyone can plant public files under another school's folder | High | `20260314200000_create_community_tables.sql:541`, `20260314210000_community_security_fixes.sql:13,22` |
| `certificates` | Assumed yes | Not defined in any migration | Config drift: created by hand in prod, policies unknown, paths carry no tenant prefix | Medium | `lib/certificates/pdf-generator.tsx:568`, `lib/certificates/badge-generator.ts:195` |
| `exercise-media` | No | Service role only | Created only in `seed.sql:1653`, so prod settings are untracked | Low | `supabase/seed.sql:1653` |
| `lesson-resources` | No | Service role only | OK | n/a | `20260310000000_lesson_resources_sequential_scheduling.sql:150` |
| `ai-chat-attachments` | No | Service role only | OK | n/a | `20260821120000_ai_chat_attachments.sql:5` |

Also:

- Community uploads of `video/quicktime` and `video/webm` will fail: the app accepts them
  (`app/actions/community.ts:955`) but the bucket doesn't.
- Re-uploading a payment proof will fail: the code passes `upsert:true`, but there is no UPDATE policy.
- Account deletion only finds storage files by `owner`. Files uploaded with the admin client have no
  owner, so they are never cleaned up.

## Reusable upload code

Most of the fix already exists: `uploadLandingPageAsset` was built for the page builder but nothing
calls it.

| Action | Bucket | Checks | Callers |
| --- | --- | --- | --- |
| `uploadLandingPageAsset` / `deleteLandingPageAsset` (`app/actions/admin/landing-page-assets.ts`) | `landing-page-assets`, `{tenantId}/` prefix | Admin; 5 MB; jpeg/png/gif/webp/svg; delete checks the tenant prefix | **None** |
| `uploadCourseImage` (`app/actions/teacher/course-images.ts`) | `course-images` | Teacher or admin; 5 MB; jpeg/png/gif/webp | Course form, lesson details, image block |
| `uploadCertificateAsset` (`app/actions/admin/certificate-assets.ts`) | `landing-page-assets` | Teacher or admin; 2 MB; includes svg | Certificate template editor |
| Lesson resources (`app/actions/teacher/lesson-resources.ts`) | `lesson-resources` (private) | Lesson owner; 10 MB; pdf/office/csv/images | Lesson resources manager |
| Exercise media signed upload (`app/api/exercises/media/upload-url/route.ts`) | `exercise-media` (private) | Student; audio/video extension allow-list | Media and video recorders |

The course form's upload-with-preview UI (`components/teacher/course-form.tsx:285`) is the pattern to
extract into a shared `ImageUploadField`. No public bucket accepts audio or general files, so lesson
audio and downloads need either a new bucket or the private `lesson-resources` bucket with signed
URLs.

## Fix plan

Fix security first: an upload button on top of open buckets would mean more files stored where any
user can tamper with them.

1. **Lock down storage RLS** (one migration, no UI change).
    - `payment-proofs`: limit SELECT and INSERT to the school's folder and the file owner or a school
      admin, or move the code to the admin client and drop the authenticated policies. Add a size
      limit and an image/pdf mime list.
    - `landing-page-assets`, `course-images`: drop the authenticated INSERT and DELETE policies (the
      app already uses the admin client). Remove `image/svg+xml`.
    - `community-assets`: drop the original open INSERT policy and the old DELETE policy, and require
      `foldername[1]` = the user's tenant.
    - Add migrations for the `certificates` and `exercise-media` buckets so prod matches the repo.
2. **Shared `ImageUploadField`**: upload with preview, plus a "paste URL" fallback. Extract it from
   the course form and back it with `uploadLandingPageAsset`.
3. **Branding**: use it for logo and favicon (allow `.ico` and png for favicon). Optionally add a logo
   step to onboarding.
4. **Page builder**: a Puck custom field for the 10 image props. Values stay URLs, so the AI,
   templates and save validation don't change.
5. **Product wizard thumbnail**: reuse the course form upload.
6. **Lesson audio and file blocks**: needs a bucket decision (see open questions).
7. **Avatars**: add upload to the profile form.
8. **Cleanup**: delete the dead `ProductForm`; allow `video/quicktime` and `video/webm` in the
   community bucket or stop accepting them in the app; fix the payment-proof upsert; make account
   deletion find admin-uploaded files by path.

## Page builder: reordering blocks

An admin reported that dragging a block higher or lower did not work in the landing-page editor on
the live e2e school site. It is not reproduced as a total failure: drags work locally, but they are
imprecise on tall pages and there is no other way to move a block. Local testing used a dev build of
this branch. The deployed code matches it, since `main` has no editor changes ahead of the branch. I
could not sign in to the live site.

| Finding | Detail | Evidence |
| --- | --- | --- |
| Drag works on a short page | A 3-block page: dragging the last block onto the first reordered it correctly | Local Playwright run |
| No move up/down controls | The selected block's toolbar has only its name, Duplicate and Delete. Dragging is the only way to reorder | Toolbar buttons read in the same run |
| Far drags undershoot | 8-block page: dragging the bottom block to the top of the canvas moved it up 5 places, not to the top. The canvas has to scroll during the drag | Local Playwright run, simulated slow mouse |
| Short drags can overshoot | Dragging the first block down past one neighbour put it at the very bottom of the page | Same run |
| Block list hidden while chat is docked | The left-hand block list, which also supports drag, is collapsed while the AI chat panel is docked. It is behind a header toggle | `components/admin/landing-page/puck-editor.tsx:249` |
| Editor locks during an AI turn | While an AI turn runs, the editor swaps to a locked permission set. Whether a stuck turn could leave it locked is not confirmed | `components/admin/landing-page/page-architect/page-architect-context.tsx:78` |

Not tested: a production build, a block nested in a Section or Columns, dragging inside the block
list, Safari and Firefox, touch input, and real hand input. A simulated mouse is not a person's hand,
so treat the undershoot and overshoot as evidence, not proof.

Still needed from the reporter: browser and device, what the block does when dragged (nothing, snaps
back, or the page scrolls), and whether the page is long or uses nested blocks.

If a fix is wanted later, the shared page-builder code already has a `move` operation that a toolbar
button could call. That is a product decision and is not planned here.

## Page links and the /en prefix

A page created in the builder lives at `/p/<slug>` (the home page at `/`), but nothing connects a
header or navbar link to that URL, so a new "About" page is not reachable from the nav unless someone
types `/p/about` by hand. Separately, every URL carries `/en` because the locale prefix is always on.
This section is from reading the code; the live site's header was not inspected (no sign-in).

### Header links do not know about pages

| Finding | Detail | Evidence |
| --- | --- | --- |
| Nav links are free text | Header and Navbar links are a text label plus a text URL, rendered as a plain `<a>` after a safety check that leaves valid paths untouched. There is no page picker and no slug-to-URL step | `lib/puck/components/navigation/header.tsx:77`, `navbar.tsx` (`href: { type: 'text' }`), `lib/puck/utils/safe-href.ts` |
| New pages are never added to a nav | Creating a page only inserts a `landing_pages` row. Nothing adds it to any header | `app/actions/admin/landing-pages.ts` |
| Template links are anchors | Template headers and footers link to `#about`, `#contact`, `#pricing`, `#results`. An anchor only works if that section is on the same page, so from `/p/about` it goes nowhere | `lib/puck/templates/business-coaching.ts:10`, `design-school.ts:10` |
| Dead legal links | Two templates link to `/terms` and `/privacy`. A comment in a third template says those are not routes | `business-coaching.ts:11`, `design-school.ts:11`, `course-landing.ts:45` |
| The slug-to-URL rule is copied | The rule (`home` is `/`, anything else is `/p/<slug>`) is written separately in four places, none shared with the nav blocks | `landing-pages-client.tsx:97`, `template-picker.tsx:111` and `:527`, `mcp-server/src/landing/preview.ts:185` |
| `/about` is a different page | A static `/about` route exists next to `/p/*`. It uses the app name and an `about` translation namespace, so it looks like the platform's own About page, not the school's. How it behaves on a school subdomain was not checked | `app/[locale]/(public)/about/page.tsx` |

The AI page builder takes link targets as plain text too, so it has the same blind spot.

### The /en prefix

`localePrefix: 'always'` is set in `proxy.ts:63`, so every page URL starts with `/en` or `/es`. A
link without a prefix still works: the proxy redirects it to `/<locale>/...`, using the visitor's
`NEXT_LOCALE` cookie and falling back to `en` (`proxy.ts:317`). Each such link therefore costs one
redirect.

Hiding `/en` is not a one-line change:

- next-intl has an `as-needed` mode that hides the default locale, but `proxy.ts:317-325` deliberately
  redirects locale-less URLs to a prefixed one. It was added to fix membership-guard bugs (#282,
  #287), so it conflicts with the new mode.
- About 41 places across 26 files build paths with `/${locale}`.
- Canonical and language-alternate URLs are built with the locale (`lib/seo.ts:126`), and the
  certificate verify page hardcodes `/en/` and `/es/` (`app/[locale]/verify/[code]/page.tsx:75`).
  Search engines would see `/p/about` and `/en/p/about` unless that is handled.
- The language switcher assumes the locale is the first path segment
  (`components/language-switcher.tsx`).
- About 120 test files reference `/en/` or the locale constant.
- Spanish URLs would keep `/es`. The app has no per-school language setting (the only per-school
  language signal is the daily-digest setting), so "English is the default" would apply to every
  school, including Spanish-first ones.

No change is planned. The options are: leave the prefix and accept the redirect; hide it only for the
default locale with a proxy rewrite and updated canonicals; or hide it only on school subdomains and
keep it on the platform site.

### Direction: no locale prefix (needs full analysis)

The owner's intent supersedes the three options above. The product is English-only, and Spanish would
later be its own domain (`digracias.com`), fully in Spanish. The app is pre-launch, so no existing
URLs need redirects. The direction is therefore no `/en` or `/es` in any URL, with English hardcoded
as the default. **This is a direction only; a full analysis is still needed before any work starts.**

Ideas to test in that analysis (none verified):

- Set next-intl's `localePrefix` to `'never'`, so the `app/[locale]/` route folder can stay and URLs
  rewrite to it internally.
- Hardcode `en` and drop the cookie lookup and the language switcher.
- Add Spanish later by mapping `digracias.com` to Spanish. Whether next-intl's per-domain setting fits
  this app, or a separate deployment is better, is an open question.
- Decide which language each school custom domain gets (the env file mentions custom school domains).

To analyse before starting:

1. `proxy.ts` (about lines 303-325): how the forced prefix and the first-segment locale reading
   interact with the auth, tenant and membership checks below it. This is the riskiest part.
2. About 41 places in 26 files that build `/${locale}/...` paths. Server redirects such as
   `redirect('/en/dashboard')` would put the prefix back in the address bar.
3. SEO: canonical URLs, language alternates and the certificate verify page
   (`app/[locale]/verify/[code]/page.tsx:75`).
4. Tests: whether the roughly 120 files that reference `/en/` or the locale constant go through one
   shared constant (`tests/playwright/utils/constants.ts`) or are hardcoded.
5. Emails, payment return URLs, webhook and MCP-generated links that embed the locale.
6. The language-parity test for `messages/en.json` and `messages/es.json`: keep, relax or remove.

Side effect: with no prefix, a nav link typed as `/p/about` becomes the final URL. That does not
replace a page picker for nav links.

## Open questions

- [ ] Do the production bucket policies match the migrations? The `certificates` and `exercise-media`
  buckets prove prod was changed by hand at least once.
- [ ] Lesson audio and downloads: a new public bucket, or the private `lesson-resources` bucket with
  signed URLs (better for paid content, but URLs expire)?
- [ ] Keep SVG for logos? It is common for logos, but it needs sanitizing or a private origin. The
  simplest option is to drop it.
- [ ] Should uploaded images get a media library (reuse past uploads), or is upload-per-field enough
  for now?
- [ ] Should the AI page builder be able to place images the school has uploaded?
