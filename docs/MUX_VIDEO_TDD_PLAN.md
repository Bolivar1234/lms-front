# Mux video hosting: TDD execution and issue briefs

Read with the [master design](MUX_VIDEO_HOSTING_PLAN.md), [ops runbook](MUX_VIDEO_OPS_RUNBOOK.md), and [references](MUX_VIDEO_REFERENCES.md). The work packages below are local issue-ready briefs, not created GitHub issues. Each implementation PR names its actual issue, files and route contract before coding.

## TDD method and evidence

For each actor/state/request/result behavior, write the failing contract test first, run it to establish the intended failure, implement the smallest change, then refactor green. Keep pure/domain, actual SQL/RLS, HTTP/session, browser, and real-provider checks distinct. Do not assert private implementation text or mock an entitlement check and call it application authorization.

Use synthetic RSA keys, fake clocks, scoped tenants/lessons/roles, realistic verified event fixtures and deterministic provider responses. Bound body sizes and errors; no test keys/tokens in artifacts. Service-role fixture setup may create prerequisites, but user assertions go through end-user sessions, RLS, routes and signed response validation. A ready-row seed proves downstream playback only; ingest tests traverse the actual reserve/bind/event/worker path.

Retain the existing en/es, mobile, checkpoint/completion and external-video tests. Full-config typecheck and normal production build must pass before commits according to repository rules. Never exclude generated validators, weaken types or mock font fetches to obtain a build. Report passed, failed, skipped and blocked separately under the existing PR template's **How to QA**, with fixture host/role, commands and material source citations. Existing jobs may run in parallel; this plan defines dependencies without pretending CI is globally sequential.

## PR0: establish the actual SQL test gate

**Problem:** current CI starts local Supabase but does not execute the SQL test suite. A plan cannot assume an existing db-tests check.

**Red:** add tests for the gate's runner/report contract: nonzero SQL exit, no discovered tests, skipped required media cases, invalid pgTAP plans and missing local database must fail. Inventory the actual `supabase/tests/` files rather than repeat a reviewer’s remembered count. Issue scripts under `tests/sql/` are a separate inventory, not silently discovered by `supabase test db`.

**Green:** add the minimal CI step/job that starts/resets a disposable local database and runs `supabase test db`; repair real existing suite/setup defects. Keep any explicitly diagnosed historical blocker visible; do not claim the gate green while omitting the media contract. Preserve independently running verify/e2e/image/MCP checks. No shared staging or production reset.

**Gate:** a fresh local reset, actual SQL execution and uploaded result/artifact work in CI. Distinguish repository/setup defects from new feature failures. Apply work-issue/ship-pr/pr-review-loop at execution time, and preserve the existing PR template.

## Workstream 1 / PR1: public-mode minimal schema and permissions

**Scope:** media, side source pointer, service-only school settings, caption row, durable outbox and needed webhook-ledger fields. Do not import a full shared-database baseline or add a playback-session table.

**Red first:**

- Public reset applies all new objects, types, grants, RLS and safe function execute permissions.
- Composite tenant+lesson+course+media keys reject wrong-lesson and cross-tenant pointers, even from an otherwise privileged mutation function.
- Direct browser media/provider/source/settings/outbox writes fail; a school admin cannot self-enable through broad tenants grants.
- No source row preserves external `video_url` behavior; media state changes do not generate ordinary lesson snapshots.
- A non-null immutable request actor plus key is unique despite `uploaded_by` becoming null after account deletion.
- Provider environment/asset/upload uniqueness prevents ownership by two schools; tenant-local request keys do not collide unnecessarily.
- Transition trigger rejects regression and late resurrection. Source generation changes are compare-and-swap.
- Media-delete trigger captures cleanup with no parent/auth FK; parent cascade and repeated removal keep one durable job. Uploader departure does not delete school assets.
- Restore/clone/import guards prevent silent hosted-pointer loss before full version support; external-only operations still work.
- Caption row/storage scope cannot point at another media/tenant.

**Green:** the reviewed idempotent public feature migration and schema-aware DTO/client changes, locally regenerated types, settings disabled by default and minimal guard changes. No broad auth-hook, search-path or SayThanks-policy rewrite.

**Gate:** real SQL/RLS assertions pass from fresh public reset. Missing shared prerequisites block PR1b launch, not public-mode development.

## PR1b: required shared lms launch gate

**Scope:** a checked namespace variant and target verifier, separate from the public schema PR if needed.

**Red first:**

- A bounded `public.` -> `lms.` variant matches the canonical feature SQL while preserving auth/extensions references and empty search paths.
- Drift checker fails when either variant changes alone or introduces an unexpected namespace/unqualified function dependency.
- Apply shared SQL twice to an isolated minimal prerequisite fixture; catalog/grants/constraints/trigger/RLS definitions match the public-mode contract after namespace normalization.
- Sentinel SayThanks public objects and auth settings remain unchanged.
- Read-only verifier rejects wrong project/schema/owner role, missing/incompatible prerequisites, unsafe grants, and unrecognized baseline versions; it does not repair or write.

**Green:** committed `supabase/shared-db/lms-lesson-media.sql`, a small parity/verification check, and explicit prerequisite/owner/catalog evidence instructions. No generic SQL framework or 1 MB unreviewed dump in this slice.

**Gate:** shared fixture passes and the actual staging catalog/owner baseline location is recorded before shared SQL application. The named database operator applies approved SQL. Public-only results are not shared-mode evidence.

## Workstream 2a: SDK adapter, webhook ledger and state trigger

**Scope:** @mux/ts, signature verification, rapid durable acknowledgement and async event processing. No UI or unguarded provider creation.

**Red first:**

- Current SDK import/contracts, lazy credentials, disabled builds without Mux keys and callback-secret independence from feature flags.
- Exact `/api/mux/webhook` platform path passes proxy without login/locale/tenant redirects; callback tenant headers do not select event ownership.
- Missing/invalid/tampered raw signatures, old/far-future timestamps, malformed/oversize body fail; valid current event is durably stored/deduped and acknowledged within the local budget.
- Database insert failure returns retryable 5xx. No external provider API call blocks acknowledgement.
- Duplicate/replayed event, lost worker claim, crash after side effect before completion, and expired claim converge idempotently.
- Ready-before-created, missing binding, foreign intent, delayed error, deletion-before-ready, provider environment mismatch and irrelevant signed event types follow the state table.
- Billing dispatchers ignore the Mux namespace; Mux dispatch does not process payment events.
- Logs/Sentry redact upload/source URLs, JWTs, credentials and headers without hiding useful event IDs/error codes.

**Green:** minimal SDK adapter with no side-effectful automatic-create retries, callback durable insert, namespaced worker claim/replay and DB transition trigger. Use bounded batches and a safe body/clock policy.

**Gate:** actual local HTTP/SQL event processing works with synthetic signed fixtures. SDK types/mock payload shape are not live callback evidence.

## Workstream 2b: upload/restart, plain pilot caps, reconcile and cleanup worker

**Scope:** internal API plus harness, pending-state safety and the minimum caps needed before a pilot. PR5 plan tiers are not a dependency.

**Red first:**

- Teacher/admin, active membership, anonymous/student, wrong school, missing/global/school flag and correct lesson-role matrix; denied requests make no Mux create call.
- Every cookie mutation requires JSON and exact server-derived school Origin; missing origin, sibling school, body CORS injection and spoofed forwarded host fail or are ignored as specified. Bearer-only writes independently validate identity and never fall back to cookies.
- Server derives origin from verified tenant ID/slug and configured platform rules; no invented custom-domain allowlist.
- Declared MIME/bytes/name/duration guidance fails malformed declarations but no test claims these are actual provider-enforced limits.
- Creation success with a URL returns the handoff once; duplicate request returns already-created/status without URL. A create or retrieve response without its optional URL never causes a blind duplicate upload or an unhandled exception.
- Explicit restart only after cancellation/absence is confirmed, under lock, with a new attempt/key; provider ingest winning cancellation returns processing. Test two concurrent restarts and response-lost-after-create.
- Unknown bind outcome retains intent; bounded nonce/environment recovery never adopts another school's/SayThanks asset.
- Five-attempt/day, two-pending/school, one-pending/lesson and conservative stored-duration reservation caps win concurrent races. Distinct attempts count; duplicate keys do not. Missing pilot config fails closed.
- Post-ingest invalid duration/video track quarantines asset; waiting timeout, preparing-age alert, 429/backoff, callback never arriving and partial outage are repairable.
- Cleanup paused makes zero destructive calls; due owned asset delete/not-found succeeds once; failed deletion retains inventory/capacity and visible retry. Cascade outbox and caption cleanup survive parent deletion.
- Loopback override reuses `isLoopbackOrigin`; deceptive/non-loopback URLs are rejected without sending credentials. No additional public or CI-only URL override switch.

**Green:** upload/status/explicit-retry routes, service-only finite pilot-cap check, actual metadata verification, bounded reconciliation and deletion worker, and monitored maintenance routes. No hard pre-ingest byte-limit claim, provider URL persistence or future plan-ledger dependency.

**Gate:** real application/session/local DB path passes. Actual waiting-upload cancellation/lost-handoff behavior is a mandatory live staging drill before pilot; absent live access is blocked evidence, not a fake pass. Worker scheduler registration belongs in ops, not an assumed cron declaration.

## Workstream 3: stateless playback and renewal

**Scope:** signed current-source gate/player, no session table and no per-grant DB write/lesson-row lock.

**Red first:**

- Author, active school admin and entitled student succeed; expired entitlement/access-cutoff/inactive member, anonymous and cross-tenant fail without provider tokens/IDs. Enrollment alone is insufficient.
- Cookie and verified Bearer paths use the same gate and selected schema. A client Mux ID/old media ID cannot choose a private asset.
- Real synthetic-RSA verification of sub, kid, aud and expiry, correct video/image audiences, positive jitter and max-duration/retention margin. Do not mint DRM audience d for this scope.
- Per-user/school mint throttle, private/no-store responses and log/Sentry redaction.
- Renewal calls the same current-pointer gate with deduped requests; revoked access shows access-ended; a new selected version shows video-updated and does not silently apply old playhead to new video.
- Referrer restriction settings align with server-derived hosts; missing-Referer/native behavior is explicitly handled, not bypassed as authentication.
- Background return, expired start, local resume scoped to user+LMS media, logout cleanup and network error preserve explicit user state.
- Flag-off stops new grants while callback/reconcile continue; existing JWT expiry is not falsely treated as immediate invalidation.

**Green:** access service patterned on `resource-download.ts`, stateless playback route, Mux player and renewal UI. Retained retired assets keep already issued tokens until expiry; new grants resolve current source. No play-completion mutation.

**Gate:** PR CI proves actual auth/SQL/JWT/player wiring only. Real signed stream renewal before/during expiry is a hard live gate; player token prop updates alone are insufficient.

## Workstream 4: pilot upload UI, manual captions, removal and operator abuse path

**Scope:** minimum teacher/student product on the shared staging target. Replacement overlap can ship later in a separate slice of this workstream.

**Red first:**

- Browser file guidance/progress/pause/retry, processing vs ready, lost-File refresh/reselection and explicit restart flow.
- Source choice respects existing external video and disables unsupported custom-domain upload. Non-video lessons remain publishable.
- Caption JSON size is counted from actual bounded request bytes; unauthorized/missing-origin/malformed UTF-8/VTT, invalid cue ranges and cross-tenant updates fail.
- Caption language/label, private media-scoped storage, ready-asset text track ingest, refreshed-source retry, duplicate track prevention, ready/errored events, removal/cascade cleanup and signed student CC access.
- Missing/processing captions produce a visible publish warning; CC keyboard controls and accessible en/es labels work. A caption warning is not a legal compliance certificate.
- Explicit media remove blocks new grants and queues durable cleanup. Uploader account departure differs from tenant/course erasure.
- Operator-only audited school disable/asset takedown, correct environment/owner check and abuse/cost escalation; school admins cannot bypass it.
- Existing audio/docs, external preview, manual lesson completion/checkpoints and teacher author preview remain correct.

**Green:** existing editor/player integration, manual WebVTT endpoint/storage/track controls, safe remove UX and operator takedown surface. Minimum acceptable-use/abuse contact, privacy/subprocessor and optional-tracking choices are linked from ops/product docs. No required AI/auto-caption credentials.

**Pilot gate:** PR0/1/1b/2a/2b/3/4 tests plus all ops/live acceptance pass. Named school, approved finite caps, cost alert/owner, actual scheduler, manual captions and cleanup must exist before enablement.

**Later replacement slice red/green:** A selected while B uploads; atomic ready+generation swap, stale ready loses to newer source choice, retired A held for fixed 24-hour retention longer than max JWT plus margin; no session table or old-version renewal. Fresh grants use B. Test concurrent selection, explicit external switch and caption/version association. Only claim the defined pointer/retention continuity, not immunity to CDN outage.

## Workstream 5: plan limits and school cost UX

**Scope:** broad-release economics; finite pilot caps already work.

**Red first:** feature/limit backfills, media-specific missing-key failure, explicit eligible unlimited value, concurrent allocation, pending->actual conversion, rejected/deleting storage count, once-only release after provider deletion, replacement A+B accounting, daily request replay, downgrade/access cutoff and recovery. Ensure existing non-media missing=unlimited semantics are unchanged.

**Green:** extend `platform_plans` features/limits, existing plan resolver/usage/admin patterns with an explicit media-cap resolver. Add monitored per-school attribution using opaque Mux references plus LMS mapping. Do not add client-telemetry delivery invoicing or promise hard direct-upload bytes/duration enforcement. No automatic non-payment asset destruction.

**Gate:** durable cost/usage tests and current Mux pricing/allowance review recorded before wider enablement. Budget warning and kill-switch owner is named; no remembered prices presented as facts.

## Workstream 6: integrations and wider release

Split into content-history and client-contract PRs when needed. No premature full baseline migration, automatic Mux AI features or separate auth project.

**Red first:**

- Snapshot/source/version/restore round trips for external, hosted, legacy snapshot, retained/deleted media, wrong tenant/lesson and competing generation; restore increments current generation rather than rewinding it.
- Side source pointer is restored together with the intended video metadata, without creating provider URLs or dropping live media. Expired/deleted historical video is explicitly unavailable.
- Clone/import/export never share provider ownership or leak a capability; initial export can require re-upload and unsupported copy must be explicit. Historical snapshots do not pin storage forever.
- Core/MCP DTO source/status and updates cannot inject provider IDs or lose hosted media; existing public/lms environment selection remains valid.
- Native Bearer player/renewal/referrer/captions use the same access gate. Native-device playback is separate from mobile Chromium emulation.
- YouTube/manual transcript/question paths remain intact; hosted extraction shows deferred/unavailable and never passes a Mux URL into the YouTube extractor.
- School/account deletion outbox, privacy docs, local resume clearing, schema/env/ops and en/es coverage match final enabled behavior.

**Green:** supported content/client contracts and their versioned rollout, explicit guards for unsupported actions, current docs and operator evidence. Full clone can require independent re-upload rather than a new provider-copy subsystem.

**Gate:** all enabled integration contracts and live shared staging checks pass; separate approval is still needed for production SQL/deploy/enablement. Unsupported client capabilities remain safely disabled and documented rather than silently skipped.

## CI topology and mandatory browser coverage

Current jobs are verify, MCP, e2e and production image. Add SQL execution in PR0; add focused `npx vitest run tests/unit/media` when media tests exist, while retaining the full unit/typecheck/lint/build gates. Add a drift/shared-contract check with PR1b; do not invent an already-existing authenticated-media project.

Media specs live in the current desktop-chromium project and use existing login helpers/one worker plus `test.describe.configure({ retries: 0 })`. Extend the report checker to fail any required media skip/fixme and unexpected retries/flakes, regardless of wording, with report-fixture unit coverage. Focused discovery must fail if expected media tests are absent; do not demand every file on every shard. Mobile applicability is selected deliberately, not hidden by auth skips.

Use the existing loopback provider stub with synthetic keys and real local application sessions. Six browser scenario families:

| Family | Required contract |
| --- | --- |
| Teacher upload/recovery | Actual reserve/bind route, stub request CORS/provenance, signed synthetic callback/worker -> local ready, restart/cancel race and lost-File UX. |
| Authorization | Anonymous, wrong school, no entitlement, inactive member; author/admin and cookie/Bearer allow cases; no tokens on denial. |
| Student player | Actual signed response/claims/player attributes, renewal/access-ended/resume; real frames explicitly outside PR-CI proof. |
| Captions/accessibility | Private WebVTT upload/ingest/ready/error/remove, CC language/keyboard, missing-caption warning, unauthorized caption denial. |
| Remove/existing behavior | Durable removal/worker pause, external/video/audio/document paths, current checkpoints/completion, restore/clone guards and later supported round trips. |
| Caps/operator/flags | Finite pilot caps under concurrency, sibling-school CSRF, operator takedown, global/school flag rollback with callback/reconcile still alive. |

Real Mux smoke is a separate protected workflow/manual staging run, not a fork-PR secret dependency. Its run manifest and cleanup-always step plus independent sweeper cover actual uploads, signed caption/stream playback, mid-stream renewal, optional-field/lost-handoff recovery, cancellation races, abuse/flag drills, provider deletion and inventory release. Full procedure and pass/fail/blocked reporting are in the ops runbook.
