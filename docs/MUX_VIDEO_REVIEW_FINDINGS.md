# Mux video hosting: consolidated review findings (round 3)

Companion to the [master plan](MUX_VIDEO_HOSTING_PLAN.md), [TDD work packages](MUX_VIDEO_TDD_PLAN.md), [ops runbook](MUX_VIDEO_OPS_RUNBOOK.md) and [references](MUX_VIDEO_REFERENCES.md). This file records review findings so another reviewer can accept, reject or refine each one by ID. It changes no design by itself; nothing here authorizes implementation, shared-database writes, deployment or enablement.

## Provenance and how to read this

- **Documents reviewed:** the four plan files at commit `c221efbb` (PR #25 head). Relative to the text first reviewed, the master gained only the "Review and contribution workflow" section; the TDD plan and ops runbook are byte-identical; references differ by a trailing newline.
- **Code read at:** `main` before `d5db2bf` for the original review, then spot-checked again at `d5db2bf` (merge of PR #24 and PR #25). Nothing was executed against the application, a database or Mux.
- **Method:** six parallel read-only reviews (cross-document consistency, security, repo-fit against code, Mux provider facts, scope/schedule, product/accessibility/UX). Model agreement is not evidence; each finding says whether it is verified against code, taken from a reviewer's reading, or an unverified assumption.
- **Mux facts** came from summarized documentation pages. Rows marked UNVERIFIED were not confirmed and must be checked against the official docs or a live run before the plan relies on them.
- **Labels:** D = design blocker, P = pilot blocker, I = implementation task, O = optional improvement. Status values: `open`, `verified-open-at-d5db2bf`, `needs-decision`.
- **Second review:** [Codex's review comment](https://github.com/Bolivar1234/lms-front/pull/26#issuecomment-6373777308) (PR #26 at `dad21165`, code at `d5db2bf`) corrected several claims in the first version of this file. Each correction was re-checked against `d5db2bf` before being applied; where the first version was wrong, the text below is replaced and section K records the disposition. Note that the original review read `main` partly before PR #24's storage hardening migrations, which is why some storage facts were outdated.
- **Reviewer's replies welcome:** answer by ID (for example "F-04: agree, fix X" or "F-12: reject because ..."), with the commit you reviewed.

## A. Design blockers

### F-01 (D) Webhook ledger cannot do "persist, acknowledge, process later"
- **Plan text:** callback durably stores the verified event, acknowledges, and a worker processes it (HOSTING_PLAN "Webhook and maintenance contract"; TDD workstream 2a).
- **Evidence (reviewer, from `supabase/migrations/20260808154215_atomic_webhook_event_claim.sql`):** `claim_webhook_event` always inserts the row already leased to the caller (`attempt_count=1`, 300 s lease). There is no unclaimed insert, `next_attempt_at` or backoff, and the eight-attempt cap and 10-minute minimum age belong to the payment redelivery cron (not the claim function) and do not fit Mux's 24-hour provider retry window. The provider's retry window and internal worker recovery are separate budgets, and internal recovery must outlive the provider giving up. Re-claiming overwrites `payload`.
- **Fix:** a new unclaimed-insert function (or nullable lease on insert) plus backoff columns for the Mux namespace; keep payment behavior unchanged.
- **Acceptance test:** insert-then-acknowledge leaves the row immediately claimable by the worker; a second delivery of the same event id does not overwrite stored payload.
- **Status:** open (code read, not run).

### F-02 (D) Stalled Mux rows can starve payment redelivery (confirmed at code level, conditional)
- **Evidence (verified at `d5db2bf`, `app/api/cron/redeliver-webhook-events/route.ts`):** the scan selects `webhook_events` where `processed_at is null`, and either the lease has expired or (never started and `last_error` is set), `attempt_count < MAX_SWEEP_ATTEMPTS`, `received_at <= ageCutoff`, ordered by `received_at` ascending with `limit(BATCH_SIZE)` (25), and has **no provider predicate before the limit**. Rows in an unknown namespace hit `result.skipped++; continue` without being changed.
- **Eligibility:** only rows that are old enough, retry-eligible and under the attempt cap occupy the scan; merely unprocessed, fresh, or unleased/error-free rows do not qualify. Twenty-five such `mux:lms:<environment>` rows would occupy every scan repeatedly. This is a future integration failure if Mux shares this ledger, not a current production incident.
- **Fix:** add a positive payment-namespace filter in the database query **before** the limit. A separate Mux sweeper alone does not isolate payments while the payment query stays unfiltered. Never retire an unprocessed Mux event through billing dispatch.
- **Acceptance test:** 25 older eligible `mux:lms:<environment>` rows plus one newer eligible payment row: the payment row is processed and the Mux rows remain available to their own worker.
- **Status:** open; confirmed conditional design blocker.

### F-03 (D) Bearer clients ignore the schema selector
- **Evidence (verified at `d5db2bf`):** `lib/supabase/api-auth.ts` calls `createBearerClient` three times (about lines 80, 94, 117) without `db: { schema }`; `lib/supabase/schema.ts` exports `DB_SCHEMA` as a bare cast `as 'public'`. Under `NEXT_PUBLIC_SUPABASE_DB_SCHEMA=lms` Bearer requests would query `public`. This also affects existing mobile/native Bearer features on shared staging, not only Mux. The master plan currently says "audit" and, elsewhere, that cookie and Bearer paths share schema configuration, which is false today.
- **Fix:** pass `DB_SCHEMA` to all three; replace the cast with runtime validation (allowed set, fail closed). Audit `mcp-server` (it has its own `getDbSchema()`).
- **Acceptance test:** with the selector set to `lms`, a Bearer request reads `lms` rows; an invalid selector value fails at startup.
- **Update:** implemented in draft [PR #27](https://github.com/Bolivar1234/lms-front/pull/27) (all three Bearer clients receive the selector; the app selector validates `public`/`lms`). The original `as 'public'` assertion does not convert `lms` to `public` at runtime; the defect was the missing client option. PR #27 keeps a documented static SDK type assertion because existing helpers and generated types are public-shaped. Do not describe it as merged or deployed, and do not start a duplicate fix. The separate MCP selector reads `SUPABASE_DB_SCHEMA` (not `NEXT_PUBLIC_SUPABASE_DB_SCHEMA`) in `mcp-server/src/env.ts` and still silently defaults unsupported values to `public`; its validation is a separate item.
- **Status:** fix proposed in PR #27 (pending CI, merge and live shared-staging role/RLS verification); verified-open on `main` at `d5db2bf`.

### F-04 (D) Mixed cookie and Bearer credentials
- **Evidence (verified in code, `lib/supabase/api-auth.ts`):** `getApiAuthContext` takes the cookie path whenever any `sb-*` cookie exists, even if an `Authorization` header is also present; `getBearerUser` is Bearer-only. The plan's "Bearer-only writes never fall back to cookies" is false for `getApiAuthContext`.
- **Risk (qualified):** cookie-first behavior is verified, but that alone does not prove an exploitable existing teacher route. The gap is the credential-mode contract for new media handlers: they must resolve credential mode before deciding whether Origin checks apply.
- **Fix:** reject mixed credentials on the new media mutations, or use an explicitly Bearer-only path that never falls back; do not infer Bearer-only mode from the mere presence of a header while authenticating cookies. A request with neither credential must not skip the Origin check. Do not broaden this into a rewrite of unrelated existing auth flows.
- **Acceptance test:** missing, malformed, mixed and valid native Bearer cases, including sibling-school Origins, on every new teacher mutation route.
- **Status:** verified-open-at-d5db2bf.

### F-05 (D) Restore guard needs a snapshot marker
- **Evidence (reviewer):** `snapshot_lesson_version` snapshots `video_url` only; `restore_lesson_version` (SECURITY DEFINER, `search_path=public`) restores it. The side table `lesson_video_source` is not snapshotted, so a guard can reject restores only for a lesson that is currently hosted.
- **Fix:** add a video-mode marker to snapshots when the side table ships (PR1), so restoring a hosted-era version onto an external lesson, or the reverse, is detectable. Match integer vs bigint lesson ids (see F-27).
- **Acceptance test:** under the same source/generation lock, hosted-to-external and external-to-hosted restores, hosted-era snapshots after the current source was removed, deleted historical media, and an ordinary external-only restore; unsupported transitions are rejected without changing either the pointer or the lesson fields. Define legacy-snapshot handling before hosted media ships.
- **Status:** open.

### F-06 (D) The accelerated-expiry drill has no mechanism
- **Plan text:** the drill is a hard launch gate; TTL is `max(3600, ceil(duration)+900)` plus jitter; the ops runbook forbids new test switches and bars `MUX_API_BASE` on deployed apps.
- **Fix:** name an operator-only staging override (for example a TTL override honored only for a fixture school), or redefine the drill as a short-duration real asset plus a short-`exp` token minted by an operator tool.
- **Constraint:** a separately minted short token alone is insufficient unless the real player and the authenticated renewal endpoint are exercised. Never accept a client-supplied TTL in the production playback API.
- **Acceptance test:** the override is rejected for any non-fixture school and absent in production configuration; the before-expiry and background-return behavior is exercised through the real player and renewal endpoint.
- **Status:** needs-decision.

### F-07 (D) Second upload to a lesson with a ready video is undefined in the pilot
- Replacement overlap is deferred, but the plan never says what the pilot does. Recommended default: block upload while a ready or selected hosted media exists; remove first.
- **Acceptance test:** upload start on such a lesson returns a stable conflict code with a remove-first UI, enforced under the same lesson reservation lock; duplicate idempotent retries keep their existing result; the refusal makes no provider call and consumes no new daily attempt.
- **Status:** needs-decision.

## B. Pilot blockers

### F-08 (P) Mux plan and test-asset limits (verification action; summarized docs only)
- The published `@mux/ts` 15.6.1 documents test assets as ten seconds, watermarked and deleted after 24 hours (per-asset flag, not an environment property). They can exercise some callback wiring but cannot establish the duration, retention and long-playback acceptance matrix. The summarized Mux changelog page mentioned a free-plan stored-asset cap; treat that as unverified current-account state.
- **Action:** verify the current account's allowance, stored-asset count, pricing and the fixture cleanup budget with Mux before scheduling live runs. This is a verification action, not an unconditional paid-plan purchase requirement. Do not use `test: true` assets for acceptance.

### F-09 (P) Rate-limit store
- **Evidence (verified):** `lib/rate-limit.ts` is an in-memory LRU per instance, so a "30 grants per ten minutes" budget multiplies by instance count and resets on redeploy; the existing check also invites fail-open handling.
- **Fix:** name a Postgres-backed atomic counter (or Redis); fail closed on store error; separate throttles for upload start and caption upload.
- **Acceptance test:** two instances share one budget; a store error denies.

### F-10 (P) Caption storage, validation and the signed URL
- **Storage (corrected, verified at `d5db2bf`):** the `lesson-resources` bucket is private with a **26,214,400-byte (25 MiB)** limit after `20261022121000_private_lesson_media_and_avatars.sql`; `20261022120000_storage_security_hardening.sql` adds restrictive INSERT/UPDATE/DELETE and private-read `storage.objects` policies that include `lesson-resources`. The earlier claims of "10 MB" and "no `storage.objects` policies" were outdated (they predate PR #24). **Still true:** the MIME allowlist does not include `text/vtt`. `storage.*` is global on the shared database, so SQL for a caption bucket sits outside the `public.`→`lms.` rewrite.
- **Bucket design:** a dedicated private caption bucket is reasonable, but browser read/write denial must withstand unrelated permissive policies in shared `storage.objects`; a private-bucket flag alone is insufficient.
- **Validation to specify:** UTF-8 with BOM stripped; reject NUL; cap cue count, per-cue bytes and cue settings; reject or strip `STYLE`, `REGION` and `NOTE` blocks; ordered cue ranges within the video duration. Bound the actually streamed JSON bytes independently of the decoded UTF-8 VTT bytes (JSON escapes need substantially more transport bytes for the same 2 MiB text); do not trust `Content-Length` alone. Mux Player renders cues through the text-track API, but any LMS UI that renders cue text (transcript panel, future AI) must escape it.
- **Signed URL given to Mux:** the 10-15 minute TTL is an application assumption to prove against actual Mux fetch and retry timing (Mux documents no minimum lifetime). Restrict the host to the configured storage host, delete the object after the track is ready or the retry window ends, cap retries, redact the URL in logs and Sentry, and never copy a track source URL into an LMS DTO.
- **Track events:** the published SDK defines both `video.asset.track.ready` and `video.asset.track.errored` in its webhook types (https://unpkg.com/@mux/ts@15.6.1/src/resources/webhooks/webhooks.ts). That is contract evidence; actual delivery still needs staging verification, and bounded polling remains the fallback.
- **Acceptance tests:** policy isolation, raw and decoded size boundaries, malformed text, NUL byte, STYLE block, cue bounds, `<script>` cue text never rendered as HTML, real track ingest, and cleanup.

### F-11 (P) Operator role and audit
- Reuse the existing verified super-admin membership helper (`lib/supabase/get-user-role.ts`, `isSuperAdmin()`); map "operator" to it (the platform console has `super_admins` and `app/actions/platform`); define an audit table (actor, action, target, reason, timestamp, no foreign keys); do not use impersonation for takedown; state the CSRF story for operator server actions. Distinguish the in-app operator from the human who holds Mux/database access.

### F-12 (P) Idempotency key and cap races
- **Key:** bind each key to the complete immutable request declaration (lesson, file declaration, inputs); a changed input returns 409, never `already_created` for another request. Cap key length (128) and charset (ASCII).
- **Caps:** lock `FOR UPDATE` on the settings row inside the reservation transaction; a partial unique index `(tenant_id, lesson_id) WHERE status IN ('uploading','preparing')`.
- **Cancellation:** cancel may release pending or stored reservations once, when absence or deletion is confirmed (unique release marker). It must **not refund the daily new-attempt counter**, otherwise repeated cancel and retry bypasses the abuse cap.
- **UTC window (corrected):** `date_trunc('day', now() at time zone 'utc')` yields a timestamp without time zone, which compares incorrectly with `timestamptz`; use an explicit UTC boundary such as `(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`.
- **Acceptance tests:** a non-UTC database session, UTC midnight, parallel starts and restarts, and cancellation versus ingest; N parallel starts across two schools never exceed pending or daily caps.

### F-13 (P) Playback denial status policy (design note, not a proven vulnerability)
- The plan deliberately differentiates same-school denial from absence; what a 403 discloses depends on which lookups and public catalog data already exist, so it is not by itself a proven vulnerability or an automatic pilot blocker. A uniform 404 for inaccessible private media is a reasonable policy for the new route.
- **Acceptance test:** whichever policy is chosen has consistent DTO and status tests and returns no tokens or provider ids on denial. Do not silently change existing resource or free-preview behavior to settle this note.
- **Status:** needs-decision (route policy).

### F-14 (P) Callback host handling (earlier causal claim withdrawn)
- **Withdrawn:** the first version said the callback fails unless `NEXT_PUBLIC_PLATFORM_HOSTS` lists `circles.saythanks.org`. That is incorrect for the stated topology: `circles` is in `lib/tenant/reserved-slugs.ts` and `tenantSlugFromHostname` (`lib/tenant/host.ts`) returns `null` for reserved labels (Codex ran the helper with an empty variable: `circles.saythanks.org` returned `null`, `fixture-school.saythanks.org` returned `fixture-school`; I re-read the code and agree). API routes also skip locale and auth page guards in `proxy.ts`; an invalid tenant on an API request gets a 404, not the page redirect.
- **Kept:** the end-to-end callback-host acceptance test and explicit target configuration. Explicit host entries may still be useful for non-reserved staging hosts and canonical page redirects. `requestAuthority()` preferring `x-forwarded-host` over `host` is still a reason not to trust headers for origin decisions (F-23).
- **Acceptance test:** verify the real staging platform host, trusted proxy configuration, and a signed unauthenticated callback with no tenant lookup or redirect. The helper check is not a deployed callback test.

### F-15 (P) Captions scope (baseline already decided; proposals separate)
- The master plan, TDD plan and ops runbook consistently include **manual WebVTT captions in the pilot** and defer auto-captions and translation. Reviewer disagreement does not undo that scope or create another required product decision. Keep that baseline unless the owner explicitly changes it.
- **Separate proposals (not prerequisites for the chosen manual flow):** accept `.srt` with client-side conversion; a paste-text path; Mux auto-captions as a per-school opt-in once pricing is confirmed; block publishing only where a school or course requires captions; separate Video and Captions status chips.
- A thinner-pilot estimate (section E) does not authorize deleting the caption requirement; it records the schedule trade-off if the owner chooses it.
- **Acceptance tests:** upload, update and remove; language selection; warning copy; keyboard access; actual signed CC playback.

### F-16 (P) Launch owners and observable gates (obligations separated from proposals)
Named owners and receipts are required for: budget and abuse ownership, takedown, actual tracking behavior and privacy documentation. A report-only CSP, a particular admin dashboard UI, and any legal obligations are proposals unless a product or policy basis requires them; a bounded operator inventory and cost report may satisfy a named pilot before a larger dashboard. The plan's refusal to claim blanket legal compliance stands. Original list follows.
Abuse contact and acceptable-use terms, takedown time target and removal log, legal reporting duty for prohibited content, Mux in the privacy/subprocessor documentation, school data-processing questions, Mux Data tracking disabled and verified (no requests to its beacon host), a report-only CSP for Mux hosts, Mux budget alerts with a named owner, and a platform-admin view of media, cost per school and stuck rows.

## C. Implementation tasks

- **F-17 Extract a shared access helper.** (Exporting the resource-specific `canDownload` alone is not the complete media boundary: the gate must use server-verified tenant/course/author and active membership or entitlement data, and resource/free-preview behavior stays separate. Test real author/admin/student access, expired cutoff, wrong tenant, forged ownership inputs and database failure.) `lib/lessons/resource-download.ts` keeps `canDownload` unexported and tied to `lesson_resources` and a service-role client (verified at `d5db2bf`). Extract an exported author/admin/`has_course_access` check and keep the existing function as a thin caller.
- **F-18 Fail-closed media plan resolver.** `tenant_plan_limit` (`20260901120000_plan_limit_db_triggers.sql`) returns -1 for a missing key and `lib/billing/plan-limits.ts` treats it as unlimited; media keys need a separate resolver returning 0 when absent.
- **F-19 Redaction.** The core scrubber (`lib/ai/byok/redact-core.ts`) already covers `Bearer` strings and token or key query parameters, so list the specific surviving forms (bare JWTs, upload URLs, signed source URLs, private keys) as fixtures before extending it. Sentry, application `console.error` output and persisted webhook receipts need separate assertions: a Sentry hook cannot sanitize a raw console log or a ledger write. `lib/sentry/redact-event.ts` previously noted targets API-key-shaped strings; add Mux JWTs, Mux upload URLs and signed storage URLs, with a unit test over `request`, `extra` and breadcrumbs. `resource-download.ts` already logs raw Supabase errors.
- **F-20 Cron auth (calibrated).** The inspected payment cron already rejects a missing secret; a constant-time comparison is sensible hardening, and a plain comparison alone is not proof of an authentication bypass. Require strict Bearer parsing, missing and invalid-secret denial, bounded work and no secret logging (see `plans/001-cron-auth-fail-closed.md`); new routes should use a shared constant-time helper. Cap work per request.
- **F-21 Upload recovery limits.** The Mux list-uploads endpoint takes only `limit` and `page` (no filters), so recovering a lost create response needs page scans or correlation through opaque metadata (`passthrough` capped at 255 characters; `meta.external_id` 128 code points). The plan's "bounded environment-scoped upload listing" must say how: set a maximum page, time and age budget and use exact server-owned intent correlation. Exhausting the scan budget means **unknown**, not confirmed absence; retain reservation and attempt history and require reconciliation or operator intervention rather than creating another upload.
- **F-22 Webhook secrets.** Secrets are per endpoint and the API returns them once; document capture, storage and rotation. Confirmed in the published SDK (https://unpkg.com/@mux/ts@15.6.1/src/resources/system/webhooks.ts): the `signing_secret` is returned only once at creation, and a webhook `address` must be unique among the environment's webhooks, so a second endpoint cannot duplicate the same callback address. Use distinct versioned callback URLs or handlers for the overlap, share one event-dedupe namespace across endpoints, install and verify the new secret before cutover, then retire the old endpoint. (The SDK also exposes webhook list/create methods; listing has pagination only.) Define the persisted event fields (type, event id, environment, object ids, timestamps) and drop other payload data. Cap body size before verification. Test that replay after deletion resurrects nothing.
- **F-23 Origin builder** (already explicit implementation work; no new custom-domain subsystem in the pilot). `lib/platform/tenant-site-url.ts` reads request headers, so a new pure builder from tenant id and platform config is needed; `getTenantSiteUrl` must not be reused as a trust boundary. Test that spoofed `x-forwarded-host` and `Origin` are ignored. Test `cors_origin` behavior from each school subdomain (matching rules UNVERIFIED).
- **F-24 Scheduler (refined: the choice is already made).** The master and runbook already choose one host-side staging minute scheduler, separate from the existing production GitHub payment schedules; what is missing is the concrete service, host, owner and a registration receipt, not another abstract decision. Verify the scheduler's version, health and timeout behavior and that its command's HTTP client actually exists in the runtime (do not assume `curl` is installed). Record heartbeat grace, missed-run alert and bounded manual replay. Original notes: `.github/workflows/cron.yml` has no Mux routes, a hard-failing case block, one `CRON_BASE_URL` variable with a production example, and a `*/10` floor that the runbook says GitHub drops first. Coolify scheduled tasks run a command inside the container (use `curl` with a scoped secret); they skip runs when the app is unhealthy and default to a 300 s timeout (https://coolify.io/docs/applications/operations/scheduled-tasks). Choose one scheduler of record.
- **F-25 SQL test gate (PR0).** Nothing in CI runs `supabase test db`; the seven pgTAP files under `supabase/tests/` have unknown health. Time-box the repair.
- **F-26 Seam reuse.** Reuse `isLoopbackOrigin` (`lib/payments/loopback-origin.ts`) for `MUX_API_BASE`; the existing providers warn and fall back, so the stricter "reject" behavior must be an explicit choice.
- **F-27 Types.** The canonical lessons primary key is bigint (`20260126190500_lms_complete.sql`); some referencing columns and functions use integer. That is a mixed-reference inventory, not two simultaneous primary-key types; verify the actual shared catalog and match new keys and RPC arguments without a broad unrelated conversion. composite keys and the restore function argument must match. New SQL must not call unqualified helpers (`get_tenant_id()`, `has_course_access()`).
- **F-28 Pointer foreign key.** Create `UNIQUE (tenant_id, id)` on lessons and `UNIQUE (tenant_id, lesson_id, id)` on media first; the circular pointer needs no deferrable constraint if the media row is inserted first. Use `ON DELETE SET NULL (video_media_id)` only if the target PostgreSQL supports column-specific SET NULL; any alternative must cover database cascades as well as explicit application deletion ("clear in code" alone is insufficient). Test all paths from fresh public and shared fixtures.
- **F-29 Outbox hook.** A row-level BEFORE DELETE trigger on `lesson_media` fires for cascaded deletes (ordinary RI deletes), except under `session_replication_role = replica`. A repository search finds that setting only in `supabase/seed-prod.sql`; that is not evidence normal account deletion uses it. Keep seed and reset tooling out of shared application teardown, and prove that ordinary lesson, course and tenant cascades enqueue exactly once.
- **F-30 `tenants` flag.** A column revoke is a no-op while table-level UPDATE is granted; keep the flag in a service-only table (`tenant_media_settings`) with RLS on and explicit revokes of browser and PUBLIC writes (test default privileges plus RLS). Correction: `platform_bank_accounts` does grant `authenticated` SELECT under a super-admin policy; it is a precedent for server-only **writes**, not for no grants. Settings capabilities can reach the browser through a safe server DTO.

## D. Documentation edits

1. Replace "do not repeatedly ask whether shared lms mode is required" (ops runbook, master) with: lms mode is fixed; target identity is still verified read-only and missing operator/project names are requested.
2. Add a route and DTO table (method, path, auth, request and response format, status codes), including cron, operator and caption routes.
3. Add one environment-variable table (name, secret, default, who sets it, validation); settle the cron-secret name and `MUX_SIGNING_KEY` versus `MUX_PRIVATE_KEY`; name the unnamed values (environment id, upload expiry, duration bounds, retention).
4. One status vocabulary table covering media, caption, upload API result and player state (add "quarantine" to the state machine or remove it; reconcile Mux "waiting" with the database `uploading`; define `already_created`, `processing`, "handoff-unavailable", `access-ended`, `video-updated`).
5. Name the caption table, cleanup outbox and webhook ledger; define `request_actor_id` (Bearer and MCP callers; behavior after account deletion), "opaque school billing reference", and the operator role.
6. Unify numbering (WS0-WS6 with a/b suffixes plus a mapping to PRs); PR3, PR4 and PR6 are referenced as a set but never defined consistently.
7. Replace unmeasurable gates with numbers: rate limits, budget threshold, missed-tick grace. (The 2 s target versus 5 s provider deadline is not a contradiction; the runbook says "within five seconds (target under two)". Name the actual service and measure acknowledgement time.)
8. Give worked token values: a 90-minute lesson is 5400 + 900 + up to 120 = at most 6420 s (about 1.8 h).
9. Dedupe the pilot caps, flag semantics and webhook timing text into one canonical place; link elsewhere.
10. Move the imperative workflow/AI items in the references appendix under a "Deferred" heading.
11. Add a requirement-to-test traceability matrix, migration filenames and a rollout receipt template. Missing tests: operator key deletion, heartbeat alerts, foreign-provenance dead letter, inventory/outbox dedupe, caption size boundary, Mux Data tracking off.
12. Name the actual scheduler service and host. The master plan and runbook already mention Coolify for staging (an earlier version of this file wrongly said no file does); the older deployment docs still describe Dokploy for production. Do not reopen the scheduler choice.

## E. Scope, sequencing and effort (estimates, not measurements)

The figures are estimates. The extra browser runtime and the fixed cap of about 25 specs are unmeasured proposals, not acceptance evidence; required behavioral coverage should drive test design and measured CI budgets. If a restart UI is deferred, an explicit safe recovery or operator path must still exist, and uncertain creation must never become a blind retry.

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
- **Copy caveats:** the table below says "up to 2 GB" while the plan's 2 GiB is declared guidance, not a proven provider byte ceiling, so do not present it as an enforced guarantee; "Usually 2–10 minutes" needs observed provider evidence; the 80% captioned target is a pilot metric and must not read as permission to bypass any school-specific caption requirement; new viewer analytics must not contradict the opt-out and privacy baseline.
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

## J. Inputs and decisions still needed

Already decided in the plan and not to be re-asked: shared `lms` deployment, manual WebVTT captions in the pilot, one host-side staging scheduler, and that production rollout needs separate approval. Only genuinely absent target or owner inputs and explicit scope changes remain:

1. Who is the shared-database operator, and where is the approved baseline stored?
2. Which school is the pilot, who is on call, and who owns the abuse contact?
3. Which Mux account state applies (verify allowance, asset counts and pricing; F-08)?
4. Playback status policy for non-entitled users on the new route (F-13)?
5. Pilot behavior of a second upload (F-07) and the expiry-drill mechanism (F-06)?
6. The actual scheduler service, host and owner (F-24)?
7. If the owner wants to change scope (for example defer manual captions or the restart UI), that is an explicit change, not an open question.

## K. Disposition after the second review

Each ID carries a status, an evidence confidence with source commit, an owner or work package, and the section that holds its acceptance test. "Code-verified" means read in `d5db2bf` source or migrations by this file's author after the second review; "reviewer-read" means taken from a reviewer without independent confirmation; "SDK-documented" means stated in the published `@mux/ts` 15.6.1 sources; "unverified" means not confirmed against current provider behavior. Work packages follow the TDD plan numbering.

| ID | Status | Evidence confidence (commit) | Owner / work package | Acceptance test |
| --- | --- | --- | --- | --- |
| F-01 | accepted, refined | code-verified (`d5db2bf`) | PR2a | section A, F-01 |
| F-02 | accepted, conditional blocker | code-verified (`d5db2bf`) | PR2a/2b | section A, F-02 |
| F-03 | fix proposed in PR #27; pending merge and live check | code-verified | PR #27, then Ops | section A, F-03 |
| F-04 | accepted, exploit claim qualified | code-verified | PR2b (new routes) | section A, F-04 |
| F-05 | accepted | code-verified | PR1, PR6 | section A, F-05 |
| F-06 | accepted, mechanism to settle | design | PR3 / Ops | section A, F-06 |
| F-07 | accepted, default recommended | design | PR2b/PR4 | section B, F-07 |
| F-08 | verification action | SDK-documented; account state unverified | Ops | section B, F-08 |
| F-09 | accepted | code-verified | PR2b/PR3 | section B, F-09 |
| F-10 | accepted, facts corrected | code-verified; track events SDK-documented; delivery unverified | PR4 | section B, F-10 |
| F-11 | accepted | code-verified helper | PR4 | section B, F-11 |
| F-12 | accepted, refined | design | PR2b | section B, F-12 |
| F-13 | design note, no automatic blocker | design | PR3 | section B, F-13 |
| F-14 | causal claim withdrawn; deployment test kept | code-verified | Ops | section B, F-14 |
| F-15 | baseline already includes manual captions; proposals separate | design | PR4 | section B, F-15 |
| F-16 | accepted; obligations separated from proposals | design | Ops / product owner | section B, F-16 |
| F-17 | accepted | code-verified | PR3 | section C |
| F-18 | accepted, already planned | code-verified | PR5 / PR2b | section C |
| F-19 | accepted, described precisely | code-verified | PR2a | section C |
| F-20 | accepted, severity calibrated | code-verified | PR2b | section C |
| F-21 | accepted | SDK-documented | PR2b | section C |
| F-22 | accepted, rotation refined | SDK-documented | PR2a / Ops | section C |
| F-23 | accepted, already planned | code-verified | PR2b | section C |
| F-24 | refined; choice already made | reviewer-read; host unverified | Ops | section C |
| F-25 | accepted | code-verified (CI does not run the SQL suite; suite health unknown) | PR0 | section C |
| F-26 | accepted, already specified | code-verified | PR2b | section C |
| F-27 | accepted, claim clarified | code-verified | PR1 | section C |
| F-28 | accepted, fallback requirement added | design; target PostgreSQL version unverified | PR1 | section C |
| F-29 | accepted; exceptional paths to verify | code-verified (`seed-prod.sql` only) | PR1 | section C |
| F-30 | accepted, example corrected | code-verified | PR1 | section C |

## Caveats

Reviewers read the documents and code without running anything; effort numbers are estimates; Mux details come from summarized pages and are marked where unverified. This document records findings and proposals only.
