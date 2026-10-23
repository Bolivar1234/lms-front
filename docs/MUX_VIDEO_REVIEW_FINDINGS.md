# Mux video hosting: consolidated review findings (round 3)

Companion to the [master plan](MUX_VIDEO_HOSTING_PLAN.md), [TDD work packages](MUX_VIDEO_TDD_PLAN.md), [ops runbook](MUX_VIDEO_OPS_RUNBOOK.md) and [references](MUX_VIDEO_REFERENCES.md). This file records review findings so another reviewer can accept, reject or refine each one by ID. It changes no design by itself; nothing here authorizes implementation, shared-database writes, deployment or enablement.

## Provenance and how to read this

- **Documents reviewed:** the four plan files at commit `c221efbb` (PR #25 head). Relative to the text first reviewed, the master gained only the "Review and contribution workflow" section; the TDD plan and ops runbook are byte-identical; references differ by a trailing newline.
- **Code read at:** `main` before `d5db2bf` for the original review, then spot-checked again at `d5db2bf` (merge of PR #24 and PR #25). Nothing was executed against the application, a database or Mux.
- **Method:** six parallel read-only reviews (cross-document consistency, security, repo-fit against code, Mux provider facts, scope/schedule, product/accessibility/UX). Model agreement is not evidence; each finding says whether it is verified against code, taken from a reviewer's reading, or an unverified assumption.
- **Mux facts** came from summarized documentation pages. Rows marked UNVERIFIED were not confirmed and must be checked against the official docs or a live run before the plan relies on them.
- **Labels:** D = design blocker, P = pilot blocker, I = implementation task, O = optional improvement. Status values: `open`, `verified-open-at-d5db2bf`, `needs-decision`.
- **Reviewer's replies welcome:** answer by ID (for example "F-04: agree, fix X" or "F-12: reject because ..."), with the commit you reviewed.

## A. Design blockers

### F-01 (D) Webhook ledger cannot do "persist, acknowledge, process later"
- **Plan text:** callback durably stores the verified event, acknowledges, and a worker processes it (HOSTING_PLAN "Webhook and maintenance contract"; TDD workstream 2a).
- **Evidence (reviewer, from `supabase/migrations/20260808154215_atomic_webhook_event_claim.sql`):** `claim_webhook_event` always inserts the row already leased to the caller (`attempt_count=1`, 300 s lease). There is no unclaimed insert, `next_attempt_at` or backoff, and the 8-attempt cap and 10-minute minimum age do not fit Mux's 24-hour retry window. Re-claiming overwrites `payload`.
- **Fix:** a new unclaimed-insert function (or nullable lease on insert) plus backoff columns for the Mux namespace; keep payment behavior unchanged.
- **Acceptance test:** insert-then-acknowledge leaves the row immediately claimable by the worker; a second delivery of the same event id does not overwrite stored payload.
- **Status:** open (code read, not run).

### F-02 (D) Stalled Mux rows can starve payment redelivery
- **Evidence (reviewer; consistent with a spot-check of `app/api/cron/redeliver-webhook-events/route.ts` at `d5db2bf`):** the scan selects the oldest unprocessed rows with `limit(BATCH_SIZE)` (25) and classifies unknown namespaces as skipped. The spot-check did not conclusively confirm the absence of any provider filter; reviewer must re-read the query before changing it.
- **Fix:** exclude the Mux namespace from this scan (filter) or give Mux its own sweeper. Skipped rows must not occupy the batch.
- **Acceptance test:** 25 stalled `mux:` rows do not delay redelivery of an eligible payment row.
- **Status:** open, needs a precise re-read.

### F-03 (D) Bearer clients ignore the schema selector
- **Evidence (verified at `d5db2bf`):** `lib/supabase/api-auth.ts` calls `createBearerClient` three times (about lines 80, 94, 117) without `db: { schema }`; `lib/supabase/schema.ts` exports `DB_SCHEMA` as a bare cast `as 'public'`. Under `NEXT_PUBLIC_SUPABASE_DB_SCHEMA=lms` Bearer requests would query `public`. This also affects existing mobile/native Bearer features on shared staging, not only Mux. The master plan currently says "audit" and, elsewhere, that cookie and Bearer paths share schema configuration, which is false today.
- **Fix:** pass `DB_SCHEMA` to all three; replace the cast with runtime validation (allowed set, fail closed). Audit `mcp-server` (it has its own `getDbSchema()`).
- **Acceptance test:** with the selector set to `lms`, a Bearer request reads `lms` rows; an invalid selector value fails at startup.
- **Status:** verified-open-at-d5db2bf.

### F-04 (D) Mixed cookie and Bearer credentials
- **Evidence (verified in code, `lib/supabase/api-auth.ts`):** `getApiAuthContext` takes the cookie path whenever any `sb-*` cookie exists, even if an `Authorization` header is also present; `getBearerUser` is Bearer-only. The plan's "Bearer-only writes never fall back to cookies" is false for `getApiAuthContext`.
- **Risk:** a malicious sibling school page can drive cookie-authenticated mutations; Origin and JSON checks apply only if the route treats the request as a cookie request.
- **Fix:** reject mixed credentials on teacher mutations, or use the Bearer-only helper for Bearer routes; a request with neither credential must not skip the Origin check.
- **Acceptance test:** a request carrying both Bearer and cookies with a missing or wrong Origin is rejected on every teacher mutation route.
- **Status:** verified-open-at-d5db2bf.

### F-05 (D) Restore guard needs a snapshot marker
- **Evidence (reviewer):** `snapshot_lesson_version` snapshots `video_url` only; `restore_lesson_version` (SECURITY DEFINER, `search_path=public`) restores it. The side table `lesson_video_source` is not snapshotted, so a guard can reject restores only for a lesson that is currently hosted.
- **Fix:** add a video-mode marker to snapshots when the side table ships (PR1), so restoring a hosted-era version onto an external lesson, or the reverse, is detectable. Match integer vs bigint lesson ids (see F-27).
- **Acceptance test:** restoring a snapshot taken while hosted is rejected or explicitly handled in both directions.
- **Status:** open.

### F-06 (D) The accelerated-expiry drill has no mechanism
- **Plan text:** the drill is a hard launch gate; TTL is `max(3600, ceil(duration)+900)` plus jitter; the ops runbook forbids new test switches and bars `MUX_API_BASE` on deployed apps.
- **Fix:** name an operator-only staging override (for example a TTL override honored only for a fixture school), or redefine the drill as a short-duration real asset plus a short-`exp` token minted by an operator tool.
- **Acceptance test:** the override is rejected for any non-fixture school and absent in production configuration.
- **Status:** needs-decision.

### F-07 (D) Second upload to a lesson with a ready video is undefined in the pilot
- Replacement overlap is deferred, but the plan never says what the pilot does. Recommended default: block upload while a ready or selected hosted media exists; remove first.
- **Acceptance test:** upload start on such a lesson returns a stable refusal code and consumes no daily attempt.
- **Status:** needs-decision.

## B. Pilot blockers

### F-08 (P) Mux plan and test-asset limits (UNVERIFIED beyond the cited pages)
- Free plan documents a 10-stored-asset cap (https://www.mux.com/docs/changelog/video-free-plan). Assets created with `test: true` are 10 seconds, watermarked and deleted after 24 hours (create-direct-upload API page); that is a per-asset flag, not an environment property.
- **Consequence:** live acceptance (a 90-minute video, renewal drill, captions) needs real assets on a plan that allows them. Pilot caps plus staging reruns will exhaust a 10-asset allowance.
- **Action:** confirm plan limits and environment behavior with Mux before scheduling live acceptance. Do not rely on `test: true` for acceptance.

### F-09 (P) Rate-limit store
- **Evidence (verified):** `lib/rate-limit.ts` is an in-memory LRU per instance, so a "30 grants per ten minutes" budget multiplies by instance count and resets on redeploy; the existing check also invites fail-open handling.
- **Fix:** name a Postgres-backed atomic counter (or Redis); fail closed on store error; separate throttles for upload start and caption upload.
- **Acceptance test:** two instances share one budget; a store error denies.

### F-10 (P) Caption storage, validation and the signed URL
- **Storage (verified):** `lesson-resources` is private, 10 MB, with a MIME allowlist that excludes `text/vtt`, and has no `storage.objects` policies (service-role signing only). `storage.*` is global on the shared database, so a `public.` to `lms.` rewrite does not cover it. Use a dedicated private bucket (2 MiB limit, `text/vtt` only) and put its SQL outside the namespace rewrite.
- **Validation to specify:** UTF-8 with BOM stripped; reject NUL; cap cue count, per-cue bytes and cue settings; reject or strip `STYLE`, `REGION` and `NOTE` blocks; ordered cue ranges within the video duration; size checked after JSON decoding (escapes can be roughly six times the raw size), with `Content-Length` and streaming caps. Mux Player renders cues through the text-track API, but any LMS UI that renders cue text (transcript panel, future AI) must escape it.
- **Signed URL given to Mux:** state a 10-15 minute TTL, restrict the host to the configured Supabase storage host, delete the object after the track is ready (or after the retry window), cap retries, redact the URL in logs and Sentry, and never copy a track source URL into an LMS DTO. Mux documents no minimum URL lifetime (UNVERIFIED).
- **Track events:** `video.asset.track.ready` / `video.asset.track.errored` could not be confirmed (reference page returned 404). Plan bounded polling as the fallback.
- **Acceptance tests:** 2 MiB boundary; escape-expanded body; NUL byte; STYLE block; `<script>` in cue text never rendered as HTML.

### F-11 (P) Operator role and audit
- Map "operator" to `isSuperAdmin()` (the platform console has `super_admins` and `app/actions/platform`); define an audit table (actor, action, target, reason, timestamp, no foreign keys); do not use impersonation for takedown; state the CSRF story for operator server actions. Distinguish the in-app operator from the human who holds Mux/database access.

### F-12 (P) Idempotency key and cap races
- **Key:** `(tenant_id, request_actor_id, request_key)` with a client-chosen key. Reuse with a different lesson or file declaration must return 409, never `already_created` for another lesson. Cap key length (128) and charset (ASCII).
- **Caps:** define the lock (`FOR UPDATE` on the settings row inside the reservation transaction), the UTC window (`created_at >= date_trunc('day', now() at time zone 'utc')`), a unique release marker so cancel releases quota once, and a partial unique index `(tenant_id, lesson_id) WHERE status IN ('uploading','preparing')`.
- **Acceptance test:** N parallel starts across two schools never exceed pending or daily caps; cancel plus retry releases exactly once.

### F-13 (P) Playback status codes leak lesson existence
- Same-tenant 403 reveals that a lesson has hosted media to non-entitled users (`lib/lessons/resource-download.ts` has the same pattern). Return 404 to non-entitled users or record the leak as accepted.
- **Status:** needs-decision.

### F-14 (P) Platform host configuration
- The callback relies on the apex host being treated as a platform host: `NEXT_PUBLIC_PLATFORM_HOSTS` must include `circles.saythanks.org`, otherwise `proxy.ts` resolves a tenant and may redirect (`proxy.ts`, `lib/tenant/host.ts`; `requestAuthority()` prefers `x-forwarded-host` over `host`).
- **Acceptance test:** a signed POST to the apex callback returns 2xx with no session, no locale redirect and no tenant lookup.

### F-15 (P) Captions product story (reviewers disagreed)
- **Product reviewer:** VTT-only leaves most videos uncaptioned. Accept `.vtt` and `.srt` (client-side conversion), optional paste-text path later, Mux auto-captions as a per-school opt-in once pricing is confirmed, warn by default and block publishing only where a school or course requires captions, show separate Video and Captions status chips.
- **Scope reviewer:** defer manual captions from the pilot and choose a school whose content needs none; if captions are non-negotiable, ship them as a separate PR that gates pilot content rather than pilot start.
- **Status:** needs-decision (product owner).

### F-16 (P) Launch blockers owned outside engineering
Abuse contact and acceptable-use terms, takedown time target and removal log, legal reporting duty for prohibited content, Mux in the privacy/subprocessor documentation, school data-processing questions, Mux Data tracking disabled and verified (no requests to its beacon host), a report-only CSP for Mux hosts, Mux budget alerts with a named owner, and a platform-admin view of media, cost per school and stuck rows.

## C. Implementation tasks

- **F-17 Extract a shared access helper.** `lib/lessons/resource-download.ts` keeps `canDownload` unexported and tied to `lesson_resources` and a service-role client (verified at `d5db2bf`). Extract an exported author/admin/`has_course_access` check and keep the existing function as a thin caller.
- **F-18 Fail-closed media plan resolver.** `tenant_plan_limit` (`20260901120000_plan_limit_db_triggers.sql`) returns -1 for a missing key and `lib/billing/plan-limits.ts` treats it as unlimited; media keys need a separate resolver returning 0 when absent.
- **F-19 Redaction.** `lib/sentry/redact-event.ts` targets API-key-shaped strings; add Mux JWTs, Mux upload URLs and signed storage URLs, with a unit test over `request`, `extra` and breadcrumbs. `resource-download.ts` already logs raw Supabase errors.
- **F-20 Cron auth.** Existing cron routes compare `Bearer $CRON_SECRET` with a plain `!==` (see `plans/001-cron-auth-fail-closed.md`); new routes should use a shared constant-time helper. Cap work per request.
- **F-21 Upload recovery limits.** The Mux list-uploads endpoint takes only `limit` and `page` (no filters), so recovering a lost create response needs page scans or correlation through opaque metadata (`passthrough` capped at 255 characters; `meta.external_id` 128 code points). The plan's "bounded environment-scoped upload listing" must say how.
- **F-22 Webhook secrets.** Secrets are per endpoint and the API returns them once; document capture, storage and rotation (a second endpoint, briefly accepting two secrets). Define the persisted event fields (type, event id, environment, object ids, timestamps) and drop other payload data. Cap body size before verification. Test that replay after deletion resurrects nothing.
- **F-23 Origin builder.** `lib/platform/tenant-site-url.ts` reads request headers, so a new pure builder from tenant id and platform config is needed; `getTenantSiteUrl` must not be reused as a trust boundary. Test that spoofed `x-forwarded-host` and `Origin` are ignored. Test `cors_origin` behavior from each school subdomain (matching rules UNVERIFIED).
- **F-24 Scheduler.** `.github/workflows/cron.yml` has no Mux routes, a hard-failing case block, one `CRON_BASE_URL` variable with a production example, and a `*/10` floor that the runbook says GitHub drops first. Coolify scheduled tasks run a command inside the container (use `curl` with a scoped secret); they skip runs when the app is unhealthy and default to a 300 s timeout (https://coolify.io/docs/applications/operations/scheduled-tasks). Choose one scheduler of record.
- **F-25 SQL test gate (PR0).** Nothing in CI runs `supabase test db`; the seven pgTAP files under `supabase/tests/` have unknown health. Time-box the repair.
- **F-26 Seam reuse.** Reuse `isLoopbackOrigin` (`lib/payments/loopback-origin.ts`) for `MUX_API_BASE`; the existing providers warn and fall back, so the stricter "reject" behavior must be an explicit choice.
- **F-27 Types.** `lessons.id` is integer in some foreign keys and bigint in others; composite keys and the restore function argument must match. New SQL must not call unqualified helpers (`get_tenant_id()`, `has_course_access()`).
- **F-28 Pointer foreign key.** Create `UNIQUE (tenant_id, id)` on lessons and `UNIQUE (tenant_id, lesson_id, id)` on media first; the circular pointer needs no deferrable constraint if the media row is inserted first. Use `ON DELETE SET NULL (video_media_id)` only if the shared database is PostgreSQL 15 or newer, otherwise clear the pointer in code.
- **F-29 Outbox hook.** A row-level BEFORE DELETE trigger on `lesson_media` fires for cascaded deletes (ordinary RI deletes), except under `session_replication_role = replica`; check the account- and tenant-deletion paths for that setting.
- **F-30 `tenants` flag.** A column revoke is a no-op while table-level UPDATE is granted; keep the flag in a service-only table (`tenant_media_settings`) with RLS on and no grants, as `platform_bank_accounts` does.

## D. Documentation edits

1. Replace "do not repeatedly ask whether shared lms mode is required" (ops runbook, master) with: lms mode is fixed; target identity is still verified read-only and missing operator/project names are requested.
2. Add a route and DTO table (method, path, auth, request and response format, status codes), including cron, operator and caption routes.
3. Add one environment-variable table (name, secret, default, who sets it, validation); settle the cron-secret name and `MUX_SIGNING_KEY` versus `MUX_PRIVATE_KEY`; name the unnamed values (environment id, upload expiry, duration bounds, retention).
4. One status vocabulary table covering media, caption, upload API result and player state (add "quarantine" to the state machine or remove it; reconcile Mux "waiting" with the database `uploading`; define `already_created`, `processing`, "handoff-unavailable", `access-ended`, `video-updated`).
5. Name the caption table, cleanup outbox and webhook ledger; define `request_actor_id` (Bearer and MCP callers; behavior after account deletion), "opaque school billing reference", and the operator role.
6. Unify numbering (WS0-WS6 with a/b suffixes plus a mapping to PRs); PR3, PR4 and PR6 are referenced as a set but never defined consistently.
7. Replace unmeasurable gates with numbers: acknowledgement time (master says under 2 s, runbook says 5 s), rate limits, budget threshold, missed-tick grace.
8. Give worked token values: a 90-minute lesson is 5400 + 900 + up to 120 = at most 6420 s (about 1.8 h).
9. Dedupe the pilot caps, flag semantics and webhook timing text into one canonical place; link elsewhere.
10. Move the imperative workflow/AI items in the references appendix under a "Deferred" heading.
11. Add a requirement-to-test traceability matrix, migration filenames and a rollout receipt template. Missing tests: operator key deletion, heartbeat alerts, foreign-provenance dead letter, inventory/outbox dedupe, caption size boundary, Mux Data tracking off.
12. Name the real scheduler host. The repo documents Dokploy; no repository file mentions Coolify.

## E. Scope, sequencing and effort (estimates, not measurements)

| Item | Size | Engineer-days | Main driver |
| --- | --- | --- | --- |
| PR0 SQL test gate | M | 2-4 | suite has never run in CI |
| PR1 public schema | M | 3-4 | schema, RLS, triggers, restore/clone guards |
| PR1b shared SQL variant and verifier | M | 3-4 plus waiting | needs the database operator's baseline |
| PR2a SDK adapter, webhook ledger, state trigger | M | 3-5 | leases, replay, redaction |
| PR2b upload/restart, caps, reconcile, delete worker | L | 6-9 | races, concurrent cap tests |
| PR3 stateless playback and renewal | M | 3-5 | renewal provable only live |
| PR4 UI, captions, removal, operator takedown | L+ | 8-12 | about four features in one PR |
| Ops steps | S-M | 2-3 | calendar-bound on people |
| Nine live scenarios | M | 4-6 | debugging and reruns |

- **As written:** about 34-52 engineer-days (7-10 weeks). **Thinner pilot:** upload, ready, signed playback with renewal, removal and cleanup, finite caps, takedown as an audited SQL function, one scheduler and the kill switches: about 24-38 days. Deferred: manual captions (4-6 days), explicit restart and cancel-race handling, takedown UI, general catalog diffing in PR1b.
- **Critical path:** PR0, PR1, PR2a, PR2b, then PR3 and PR4 in parallel, then live acceptance. Build a playback harness page in PR3 so the renewal drill runs before PR4.
- **Human unblocks to start first:** name the database operator and baseline location, on-call owner and abuse contact; create the Mux account, environment, keys and webhook secret (entered by a person); set Coolify variables and redeploy; confirm which host actually runs staging.
- **Hazards:** register the scheduler only after its routes exist; the shared-database migration is effectively irreversible, so make it additive and idempotent, back up the `lms` schema immediately before applying, and keep a guarded down script; never restore over a live shared database. About 60 red-first bullets (roughly 150-250 tests) and about 30 browser specs add roughly 3-5 minutes per shard against the 45-minute timeout; cap new browser specs near 25.

## F. Product and UX notes

Draft copy (English / Spanish) for the key states. Wording is a proposal for review.

| State | English | Spanish |
| --- | --- | --- |
| Choose source | Upload a video or paste a link | Sube un video o pega un enlace |
| File guidance | MP4 or MOV, up to 2 GB and 90 minutes. | MP4 o MOV, hasta 2 GB y 90 minutos. |
| Uploading | Uploading… keep this tab open. | Subiendo… mantén esta pestaña abierta. |
| Preparing | Preparing your video. Usually 2–10 minutes. You can leave this page. | Preparando tu video. Suele tardar de 2 a 10 minutos. Puedes salir de esta página. |
| Ready | Your video is ready. Add captions before publishing. | Tu video está listo. Agrega subtítulos antes de publicar. |
| File lost | Upload interrupted. Choose the file again to restart. | La subida se interrumpió. Elige el archivo de nuevo para reiniciar. |
| Caption warning | This video has no captions yet. Students who are deaf or hard of hearing may not be able to follow it. | Este video aún no tiene subtítulos. Los estudiantes sordos o con problemas de audición podrían no poder seguirlo. |
| Hosting off | Video upload isn't enabled for your school. Paste a YouTube, Vimeo or Loom link, or contact support. | La subida de video no está activada para tu escuela. Pega un enlace de YouTube, Vimeo o Loom, o contacta a soporte. |
| Cap hit | Your school has used all its pilot video time. Remove a video or contact support. | Tu escuela usó todo el tiempo de video del piloto. Elimina un video o contacta a soporte. |
| Access ended | Your access to this course has ended. | Tu acceso a este curso ha terminado. |
| Video updated | This video was updated. Reload to watch the new version. | Este video se actualizó. Recarga para ver la nueva versión. |
| Unavailable | This video can't play right now. Try again, or report a problem. | Este video no se puede reproducir ahora. Inténtalo de nuevo o informa del problema. |

- **Status chips:** show Video and Captions separately; the publish dialog names which is pending and offers "Publish anyway" and "Wait". Add a teacher "Preview as student" check and a student Retry and "Report a problem". Add "Connection problem, retrying…" so a transient renewal failure does not look like revoked access.
- **Caps:** 300 stored minutes is roughly 30 ten-minute lessons (one small course) and a re-record counts until deletion is confirmed; size caps per named school and show "N of M min used".
- **i18n:** Mux Player's own control strings may be English-only (UNVERIFIED); `components/lesson/video.tsx` hard-codes "Unable to load video". New strings must be message keys covered by the en/es parity test; record any non-localizable player text as a known limit in the accessibility statement.
- **Resume position:** local storage is acceptable for the pilot but does not follow a student across devices; state that and do not promise otherwise. A "video updated" banner offers Reload and Keep watching and never moves the playhead.
- **Compliance wording:** the documents correctly avoid claiming ADA/FERPA/COPPA compliance. A school accessibility officer will ask for a VPAT-style statement, the WCAG level tested, a caption policy and a contact; prepare a one-page "Accessibility and data" sheet. Mux does not publish an LMS-specific VPAT.
- **Analytics (object_verb, past tense):** `video_upload_started`, `video_upload_completed`, `video_ready` (time-to-ready), `video_upload_failed` (reason code), `video_play_failed`, `caption_added`, `video_removed`; cost per student-hour from Mux usage exports joined by opaque media id, not browser events.
- **Pilot success checklist:** upload success at or above 95%; median time to ready under 10 minutes; playback start failures under 2% and the short-expiry drill passes in staging; at least 80% of published hosted videos captioned; named school contact and on-call operator; acceptable-use terms and accessibility sheet delivered; takedown and cleanup drill completed; cost per student-hour within budget; every support ticket has an owner; a teacher can recover from file-lost and flag-off without engineering help.

## G. Five tests to add

1. A request carrying both Bearer and `sb-*` cookies with a wrong or missing Origin is rejected on every teacher mutation.
2. Reusing `request_key` with a different lesson or declared size returns 409 and never `already_created` for the other lesson.
3. A valid-size JSON body with an escape-expanded VTT, a NUL byte or STYLE/REGION blocks is rejected or stripped; `<script>` in cue text is never rendered as HTML.
4. Concurrent starts (N parallel, one lesson, two schools) never exceed pending or daily caps; cancel plus retry releases quota exactly once.
5. A serialized Sentry event, `console.error` output and webhook-ledger row for a failing create contain no Mux JWT, upload URL or signed storage URL; a replayed webhook after media deletion resurrects nothing.

## H. Confirmed against official Mux documentation (as summarized)

Direct-upload fields and limits (plural `playback_policies`, `video_quality` basic/plus/premium, `max_resolution_tier` 1080p/1440p/2160p default 1080p, `timeout` 60-604800 default 3600, `passthrough` 255 characters, `meta.external_id` 128 code points); cancel works only while an upload is `waiting`; webhook delivery attempt timeout 5 s with retries for 24 hours; SDK signature tolerance 300 s; captions covered by the `v` playback audience; `@mux/mux-node` is deprecated in favor of `@mux/ts`; signing keys can be created, listed and deleted (no separate revoke call); track creation requires a ready asset. Sources are cited in the references appendix and in the Mux pages named above.

**Unverified or unavailable:** that `GET` upload returns the upload URL (docs do not say; SDK marks it optional), mid-playback token renewal behavior, `cors_origin` matching rules, `basic` quality with signed playback, track webhook events, Mux Player localization, environment limits, acceptable-use terms.

## I. State of the code after PR #24 and PR #25 (`d5db2bf`)

Spot-checked on `main`: F-03 and F-04 are open (three Bearer client constructions without a schema option; cookie-first precedence); `schema.ts` still casts the selector; `canDownload` is not exported; no storage rule allows `text/vtt`; the Stripe multi-secret change (PR #22) is present. PR #24 removed Solana payments and `vercel.json` and added storage upload and signing-boundary tests, which are useful precedents for caption-upload tests. The redelivery-cron filter question (F-02) needs a precise re-read.

## J. Decisions needed from the product owner

1. Manual captions in the pilot, or deferred (F-15)?
2. Thinner pilot scope, or keep restart handling and the takedown UI (section E)?
3. Which paid Mux plan will staging use (F-08)?
4. Who is the shared-database operator, and where is the approved baseline stored?
5. Which school is the pilot, who is on call, and who owns the abuse contact?
6. Playback status for non-entitled users: return 404, or accept and document the 403 (F-13)?
7. Pilot behavior of a second upload (F-07)?
8. Expiry-drill mechanism (F-06)?
9. Which scheduler is the scheduler of record for staging (F-24)?
10. Production rollout: separate later project?

## Caveats

Reviewers read the documents and code without running anything; effort numbers are estimates; Mux details come from summarized pages and are marked where unverified. This document records findings and proposals only.
