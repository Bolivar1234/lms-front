# English URLs and presentation

The browser-facing application now uses English at paths such as `/courses`, `/auth/login`, and `/dashboard/student`. Internal `app/[locale]` files remain in place so existing imports and route parameters keep working.

| Surface | Previous behavior | Current behavior |
| --- | --- | --- |
| Public navigation | Locale middleware added `/en` or `/es` | URLs stay unprefixed; middleware rewrites internally to the English route |
| Saved language preference | Cookie or browser preference could select Spanish | `localeDetection: false` selects the configured English default |
| Old bookmarks | `/en/...` and `/es/...` were visible URLs | next-intl redirects supported old prefixes to their bare URL, preserving the query |
| Auth and role redirects | Redirect producers emitted locale prefixes | Producers emit `/auth/...`, `/join-school`, and `/dashboard/...` |
| Navigation and notification links | Some producers explicitly prepended the active locale | Producers emit bare application paths |
| Search metadata | Canonical and sitemap URLs were duplicated by locale | One bare canonical URL and sitemap entry per public path |
| Language menu | English and Spanish choices | Hidden in public and authenticated layouts |

## Implementation boundaries

`proxy.ts` changes only locale presentation configuration, prefix redirection, and generated destination paths. Existing tenant resolution, session validation, membership lookup, course access, and role decisions retain their behavior. Internal route folders are preserved, including the billing checkout page.

`lib/auth/route-access.ts` retains the `localizePath(path, locale)` calling convention for existing callers. It now removes a supported old locale prefix instead of adding one. The shared Puck URL mapper uses the same bare path contract. No generic decoding or URL security normalization is introduced by the locale presentation change.

`lib/seo.ts`, `app/sitemap.xml/route.ts`, verification metadata, billing return URLs, digest links, and navigation producers now emit unprefixed URLs. `components/language-switcher.tsx` renders no menu. Existing catalogs and locale types remain available for internal compatibility; removing translation source files is unnecessary for the browser URL change.

## Verification

The focused locale regression run passed **199 tests in 12 files** after updating explicit old-prefix expectations; the two community-link tests also passed separately. The receipts are `locale-targeted-unit-final.log` and `locale-community-links-unit.log` in the session handoff evidence directory. The final normal production build passed in **43.714 seconds** against the frozen remediated runtime and disposable local Supabase configuration. Its receipt is `final-production-build-receipt.json`. Next's configured build skips type validation; the separate normal app typecheck passed from both cold and warm caches after aligning React development types and discarding stale incremental state.

`tests/playwright/i18n.spec.ts` now checks English presentation despite an old language cookie and Spanish browser preference, redirects from both old prefixes with query preservation, and locale-free authenticated navigation. Existing Playwright URL fixtures use bare paths. Former Spanish UI checks now assert English presentation on old bookmarks, while user-authored Spanish course content remains valid content.

The real production browser run initially passed **91 of 94** selected changed-flow cases. The three failures were test expectation mistakes: English `Login` text and Base UI's presence-only `data-active` attribute. After correcting those assertions, the complete locale and student-navigation files passed **13 of 13** with no skips, retries, or flaky cases. Together these runs cover all **94 unique** selected cases, including profile persistence, account deletion, private resource access, teacher/admin content, tenant roles, public pages, onboarding, and branding. Initial evidence remains in `browser-broader-initial.*`; the focused passing receipt is `browser-locale-navigation-rerun.receipt.json`.

Authenticated upload browser tests additionally passed **7 of 7**, using fresh student, actual teacher, and admin identities against guarded disposable local Supabase. They exercised real Auth, server actions, Storage bytes, private signed-URL renewal, profile photos, branding images, and the course-thumbnail wizard. The renewal assertions use distinct valid signed URLs and preserve both playing and paused seek positions. The Puck suite passed **6 of 6**, including all ten audited image fields, saved pages, nested movement, and genuine delayed-upload races. A further strict certificate case passed with real student completion, supported authenticated admin issuance, and actual signed PDF/badge Storage bytes. All **108 unique selected browser cases** have passing final evidence; `browser-aggregate-receipt.json` records exact commands and per-run counts without double-counting reruns.

This is desktop Chromium coverage. Signed-URL renewal uses an accelerated browser clock; actual signer requests and Storage downloads remain real. External payment/AI providers, outbound email delivery, funded live-chain flows, mobile engines, and the separate excluded security follow-up are not included. The strict certificate case exercises the supported admin signed-issuance path and does not claim ordinary student self-service signing. Overall full-suite results remain in the remediation status report.
