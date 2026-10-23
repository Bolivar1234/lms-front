# Mux video hosting: TDD packages and acceptance contracts

The [master](MUX_VIDEO_HOSTING_PLAN.md) owns scope, routes, DTOs, policy numbers and environment names. The [file map](MUX_VIDEO_FILE_MAP.md) owns proposed physical paths and integrations; this file owns package order and executable acceptance requirements. The [runbook](MUX_VIDEO_OPS_RUNBOOK.md) owns real target/provider receipts; the [findings ledger](MUX_VIDEO_REVIEW_FINDINGS.md) tracks F-01–F-30. All tests below are requirements, not completed results.

## TDD method

For each behavior: write the contract test; run it and retain the intended failure; implement the smallest change; refactor with the test green. Distinguish pure/unit, actual SQL/RLS, Auth/HTTP, browser and real-provider evidence. A mocked entitlement helper or service-role assertion is not end-user authorization. A seeded ready row proves downstream behavior only; ingest tests traverse reservation, bind, receipt and worker.

Use synthetic RSA keys, fake clocks and distinct tenants/roles/lessons. Service-role setup is allowed only against a confirmed disposable fixture; assertions use end-user sessions/RLS. Never put real keys/capability URLs in artifacts. Keep existing external video, audio/resources, preview, completion, checkpoints, i18n and applicable mobile tests. Use normal full-config typecheck and production build, including generated validators; no font mocks, source exclusions or weakened types.

Every implementation PR records the exact reviewed main/SDK version, owned files, route/test contracts, red/green commands and actual issue if one exists. The repository currently disables GitHub issues; do not invent issue numbers or enable issues. Planned PR aliases below are work-package identifiers. Use the repository work-issue/ship-pr/pr-review-loop workflows where applicable when execution is authorized; this document alone does not start application work.

## Package order and deliverables

| Package / alias | Dependencies | Deliverable and gate |
| --- | --- | --- |
| WS0 / PR0 | None | Disposable SQL test runner/CI gate; inventory and repair actual existing pgTAP suite. T25. |
| WS1 / PR1 | WS0 | Public media/source/caption/settings/outbox/rate/audit schema, integrity and initial restore/clone guards, generated types. T05/T27–T30. |
| WS1b / PR1b | WS1; repeat on later feature SQL | Checked shared variant, parity fixtures, read-only target verifier; actual owner/catalog receipt gates hosted application, not independent coding. |
| WS2a / PR2a | WS1 | Lazy SDK/signatures, unleased enqueue/worker, receipt redaction and payment scan isolation. T01/T02/T19/T22. |
| WS2b / PR2b | WS2a | Upload/status/restart/source/remove APIs, locks, finite pilot quotas, atomic throttles, reconcile/cleanup/cron authentication. T04/T07/T09/T12/T20/T21/T23/T26. |
| WS3 / PR3 | WS2b; baseline Bearer fix merged in PR #27; live shared check remains | Shared lesson access service, stateless grants, real player harness, renewal and fixture TTL policy. T03/T06/T13/T17. |
| WS4 / PR4 | WS2b; integrates WS3; WS1b before hosted smoke | Teacher/student UI, manual captions/private bucket and transport ceiling, source-aware legacy transcript/question guards, operator takedown/report and accessibility. T10/T11/T15/T16. UI and playback work may run in parallel behind those contracts. |
| WS5 / PR5 | Pilot implementation; before broader plan-tier release | Media-specific plan resolver, usage/attribution and cost UX. T18. Finite WS2b caps already gate pilot. |
| WS6 / PR6 | Pilot implementation; before enabling each wider capability | History/replacement/restore/clone contracts, native/MCP/core DTO support; unsupported capabilities remain visibly disabled. |
| Ops / live | Relevant implementation + WS1b + named approved targets | Account allowance, scheduler, actual callbacks/upload/frames/CC/renewal/recovery/delete and operator/privacy receipts. T08/T14/T24 plus live portions below. |

WS3 includes an authenticated harness so the renewal drill does not wait for final editor styling. Keep PRs bounded by these dependencies and ownership, rather than packing unrelated UI/SQL/operations changes together. No application implementation or school enablement is authorized by a docs merge.

Proposed ordered migration files (confirm filenames remain available and later than main at execution):

| Package | Proposed file / variant |
| --- | --- |
| WS1 | `supabase/migrations/20261023120000_lesson_media_core.sql` |
| WS2a | `supabase/migrations/20261023121000_mux_webhook_queue.sql` |
| WS2b | `supabase/migrations/20261023121500_lesson_media_operations.sql` |
| WS4 caption application operations | `supabase/migrations/20261023121800_lesson_caption_operations.sql` |
| WS4 global Storage | `supabase/migrations/20261023122000_lms_caption_storage.sql` |
| WS5 | `supabase/migrations/20261023123000_media_plan_limits.sql` |
| WS6 | `supabase/migrations/20261023124000_media_history.sql` |
| WS1b and every later namespace change | Update ordered feature sections in `supabase/shared-db/lms-lesson-media.sql` and its explicit `supabase/shared-db/lesson-media-manifest.json` source/section/checksum inventory. Apply global caption SQL separately as `supabase/shared-db/lms-caption-storage.sql`, matching its canonical Storage migration without an LMS namespace rewrite. |

Implement only the current package's SQL, updating the feature manifest/variant together; future filenames are not existing runnable migrations. A shared migration includes only approved feature sections, never an imported baseline. Apply feature SQL twice in disposable fixtures, compare normalized catalogs/grants/policies/functions and assert sentinel SayThanks public/auth objects unchanged. The verifier must reject an unknown baseline, wrong project/schema/owner, missing prerequisites, incompatible ID types/version or excessive grants **without writes**. Every subsequent feature migration reruns parity before hosted application.

## Test placement and CI gates

- Real SQL/pgTAP: `supabase/tests/lesson_media_*.test.sql` and `supabase/tests/mux_webhook_*.test.sql`. Inventory existing `supabase/tests/`; `tests/sql/` is a separate collection and is not silently covered by `supabase test db`.
- Pure/HTTP/adapter: `tests/unit/media/*.test.ts`; the existing Vitest include covers these paths. Use actual SDK request serialization/JWT cryptographic verification where contract behavior matters.
- Browser: `tests/playwright/media-*.spec.ts` under existing `desktop-chromium`, existing login helpers, one worker per appropriate fixture group and `test.describe.configure({ retries: 0 })`. Native-device playback is separate evidence from mobile Chromium.
- Protected staging workflow/manual equivalent: real Mux and verified disposable fixture school, cleanup-always plus independent sweeper, redacted manifest. No hosted secrets in fork PR CI.

WS0 adds a real `supabase test db` step after disposable provisioning/reset, uploads test output and checks its nonzero exit. Runner/report tests must fail on missing database, zero discovery, invalid pgTAP plan, failed assertions and skipped required cases. If an existing suite is broken, diagnose/repair it or report the gate blocked; do not drop required files to turn green. Existing verify, MCP, E2E and image jobs remain independent.

Media test discovery/report checks fail on absent expected tests, required skip/fixme and unexpected retries/flakes. Assert discovery per project/shard appropriately, not every file on every shard. PR CI proves actual local Auth/SQL/HTTP/DTO wiring with the loopback Mux stub; it does not prove streaming frames, Mux optional fields or deployed RLS. The protected real-provider smoke may be non-blocking for code merge, but its required scenarios block pilot enablement. Measure added runtime; there is no arbitrary 25-spec ceiling that permits missing coverage.

## Acceptance contracts

Each T-ID is a stable behavioral family, mapped to its finding below. Expand it into test cases at implementation; tests must assert observable outcomes and failures, not source-text matching. A documentation disposition cannot mark a test passed.

### T01

**Durable receipts and workers (F-01; WS2a).** A verified event is immutably enqueued unleased/due now and promptly acknowledged with no provider call. Durability failure returns retryable 503. Duplicate delivery cannot overwrite payload or advance business state twice. Real SQL proves lease fencing, due-only claims, SKIP LOCKED competition, expiry/crash recovery, backoff/exhaustion/dead letter and side effect before completion replay. Irrelevant signed types finish safely. Old stored verified receipts replay without inbound freshness checks. Payment claim semantics remain unchanged.

### T02

**Payment isolation (F-02; WS2a).** Insert 25 older, eligible stalled Mux rows and a newer eligible payment row into actual disposable `webhook_events`. Execute the payment query/route: the payment progresses and Mux receipts remain untouched. Assert the provider allowlist is applied before ordering/LIMIT, covering both student and platform payment namespaces. Fresh/ineligible rows do not stand in for the failure fixture. Unknown future namespaces must not permanently occupy payment batches.

### T03

**App and MCP schema/auth paths (F-03; merged baseline PR #27, WS3/WS6).** Under `lms`, real SDK Bearer membership fallback, reads and RPC writes send the lms profile; default/explicit public still works. Invalid app/MCP selectors fail validation. MCP uses its own server variable and the safe authenticated GET source-summary API, forwarding an end-user scoped token to its verified configured LMS_APP_URL; ambiguous or conflicting tenant context fails closed without service credentials or caller-origin/header bypass. Real disposable Auth/PostgREST fixtures expose different public/lms data; student/teacher/admin cookie/Bearer journeys prove actual RLS, membership and selected namespace. PR #27's unit/HTTP results alone do not close this live gate. No duplicate Bearer implementation PR.

### T04

**Credential mode and Origin (F-04; WS2b).** Every new teacher mutation rejects mixed Bearer+sb-cookie credentials. Missing/malformed credentials fail; valid native Bearer has no cookie fallback and requires no browser Origin. Cookie writes require verified identity, JSON, exact server-derived Origin and active scoped role. Wrong/missing/sibling Origin and spoofed forwarded-host/body tenant/CORS values cannot authorize. A mere Bearer header never suppresses cookie Origin checks. The existing unrelated helper precedence is not silently rewritten.

### T05

**Snapshot marker and guards (F-05; WS1 then WS6).** Real SQL records explicit source-mode/version metadata. Legacy snapshots, current-hosted/snapshot-external and current-external/snapshot-hosted restores are covered. Initially refuse any hosted restore atomically without changing title/video/pointer; external-only restore works. Unsupported clone/import/export cannot copy provider ownership or silently drop the pointer. Later round trips preserve ownership, unavailable deleted history and a strictly increasing generation under competing restores/source changes.

### T06

**Expiry and real renewal (F-06; WS3/Ops).** Fake-clock JWT tests verify normal duration formula/jitter/retention plus short-fixture policy. Production, incomplete override, wrong fixture and wrong stage reject/ignore overrides as specified by the master. No client TTL is accepted. A staging operator's actual 120-second fixture grant uses the normal authenticated endpoint and short-token renewal lead; decoded frames continue through expiry, pause/background return and renewal. Revocation denies renewal; temporary outage preserves existing valid grant then explicitly resumes after reauthorization. Player prop changes alone fail this gate.

### T07

**Remove-first pilot replacement (F-07; WS2b/WS4).** An unsaved lesson cannot create a provider upload; save the owned draft first. Ready/selected hosted media blocks a new upload with stable conflict and no Mux call/daily attempt. Two concurrent starts, two restarts, start-versus-select and remove-versus-ready preserve one active attempt/generation. Duplicate keys retain their safe outcome. Explicit removal/external selection stops new old-media grants and queues cleanup. Existing issued tokens follow their actual expiry. Later overlap tests belong to WS6.

### T08

**Provider/account feasibility (F-08; Ops).** Record actual plan/allowance, existing inventory, fixture budget and current pricing source/date. The test-asset SDK contract is not account state. Label which checks can use short watermarked test assets and which require real duration/retention/caption/stream behavior. Prove basic quality, signed policies, resolution and CORS with the selected pinned SDK/real account. Missing allowance/access blocks live evidence; do not purchase a plan or claim compatibility from a type alone.

### T09

**Shared throttles (F-09; WS2b/WS3).** Two app instances share the same Postgres user/school operation windows. Real SQL proves both-budget atomic consume/refusal, expiry cleanup, window boundaries and environment separation. Store failure denies 503; actual budget exhaustion is 429 with bounded retry information. Tests distinguish grant counters from upload daily attempts and caption budgets; no playback-session or per-view ledger is introduced.

### T10

**Private captions and cleanup (F-10; WS1/WS4/Ops).** Configure Next proxy buffering and actual ingress ceilings above the master raw-route bound. In a production-mode server through proxy, valid escaped JSON above the default 10 MiB reaches the caption validator and over-limit requests return 413 without truncation/JSON-parse errors; serverActions limits are separate. Test raw JSON and decoded UTF-8 boundaries, escaped strings, absent/false Content-Length, invalid UTF-8/surrogates, BOM/NUL, cue/settings limits, supported overlapping cues, duration bounds and STYLE/REGION rejection/NOTE stripping. Cue script text never renders as HTML. Real Storage tests include unrelated permissive policies, cross-tenant paths and anonymous/browser access; service-role storage setup alone is insufficient. Real ingest, ready/error events, uncertain track creation, bounded URL refresh/retry, replacement association, signed CC and remove/cascade cleanup are required. Same-language/same-label replacement uses a durably reserved unique provider ingest-attempt UUID/name and opaque passthrough; a confirmed retry has a fresh UUID/name even while an older errored track exists, with all track IDs retained for cleanup. A lost track-create response reconciles that exact reserved attempt without allocating another while the previous ready track stays playable. Caption source URL never reaches a lesson DTO, log or student response.

### T11

**Operator authorization/audit (F-11; WS4).** Verify session/Bearer identity at the API boundary, then fresh super_admins membership using that UUID. A forged super-admin x-user-id header without a session, or a conflicting header with an ordinary session, cannot grant operator access. Verified super-admin succeeds; school admin/student/anonymous/impersonation-as-school-user cannot takedown. Assert platform Origin/JSON, reason, environment and owned target; basic inventory/report omits capabilities. Audit survives deleting actor/tenant/lesson and records disable/delete requests. Provider-key deletion requires a separate explicit incident action/receipt and affects only the confirmed environment/key; synthetic keys in automated tests.

### T12

**Idempotency, locking and quotas (F-12; WS2b).** Same key+fingerprint returns no new handoff/charge; changed lesson/declaration/generation/operation conflicts. Actor deletion does not weaken uniqueness. Parallel transactions across lessons/schools obey master caps and consistent lock order. Test explicit UTC day bounds under non-UTC session time zones. Daily attempts are not refunded on cancel. Pending/stored capacity releases exactly once only after confirmed absence/deletion; uncertain create/cancel/ingest still counts. Outbox/inventory dedupe prevents counting an asset twice.

### T13

**Private playback errors (F-13; WS3).** New media endpoints return identical 404 for missing/cross-school/non-entitled private media, 401 for unauthenticated and 503 for real dependency failure. No response leaks provider IDs/tokens on denial; valid author/admin/entitled student succeeds. Existing resource-route refusal/public-preview semantics stay covered independently. Test lookup ordering so flags/status cannot disclose inaccessible media.

### T14

**Platform callback path (F-14; WS2a/Ops).** Unit test reserved circles without an explicit host entry plus a normal school slug. Actual local proxy/HTTP tests and deployed signed POST prove the verified platform callback bypasses page locale/login guards without tenant lookup/404/redirect, with hosting disabled and no session. Caller tenant/forwarded headers cannot select receipt ownership. A passing hostname helper is not a passing callback.

### T15

**Included manual-caption product (F-15; WS4).** Teacher upload/update/remove, distinct Video/Captions states, language/keyboard controls and signed entitled playback work in en/es. Missing/pending captions warn; any school-required caption policy blocks publish appropriately. Select hosted media while retained video_url and cached legacy YouTube transcript/timestamps exist: generation/extraction must not use the old video; hosted extraction is explicitly unavailable or an explicit lesson-text/manual-input path. External/manual generation remains intact. Unsupported native/MCP/core consumers resolve or refuse hosted mode before pilot rather than silently rendering the old URL. No SRT/AI/auto-caption key is required for pilot. Show actionable unsupported-format and failed-ingest feedback, rather than silently claiming inaccessible content is captioned. Approved checkpoint saving uses selected-source readiness: hosted-only lessons retain supported requested checkpoints, while a stale retained external URL cannot drive availability. Course list indicators and MCP learner/preview/viewer schemas/renderers resolve hosted state explicitly; initial unsupported clients show that state and suppress both legacy URL and embed fallback.

### T16

**Pilot operations/privacy/UX (F-16; WS4/Ops).** Record actual budget/contact/takedown/acceptable-use/privacy/subprocessor ownership and receipts. Verify optional Mux Data disabled with actual network capture and no viewer names/emails, local resume clearing and safe diagnostics/report path. No unmeasured processing-time or hard uploaded-byte guarantee in copy. Test school-disable/flag rollback while callback/reconciliation survive. Legal applicability and any CSP rollout are assigned decisions, not blanket compliance claims.

### T17

**Shared access service (F-17; WS3).** Fresh active school membership is required before every branch. Real scoped active course author, admin and entitled student pass; enrollment-only, expired/cutoff/inactive/cross-school users fail. Explicitly test inactive authors and inactive entitled students through cookie and Bearer paths. Forged client author/provider IDs grant nothing. DB/RPC failure is unavailable and mints no token. Existing lesson-resource/free-preview tests remain unchanged in behavior. Test gate calls from cookie, Bearer and later enabled client contracts.

### T18

**Fail-closed media plans (F-18; WS2b/WS5).** Missing pilot settings disable; approved finite reservations hold before WS5 exists. Missing/error media plan limits later disable; explicit -1 only works on an approved eligible plan. Generic course/student missing=unlimited behavior remains unchanged. Count pending-to-actual conversion, rejected/deleting inventory, A+B replacement, downgrade/access cutoff and deletion confirmation without watch-based invoicing or automatic asset destruction on non-payment.

### T19

**Redaction boundaries (F-19; WS2a).** Inject synthetic known capabilities/keys into SDK errors, request/extra/contexts/breadcrumbs, console output and immutable receipt payload. Test existing covered Bearer/token-query patterns plus bare Mux JWT, upload path URLs, signed Storage source URLs and RSA PEM. Useful event/error IDs remain. Assert persisted receipt replay can re-fetch authoritative data without retaining sensitive raw payloads.

### T20

**Maintenance authentication/bounds (F-20; WS2b).** Strict Bearer parser/shared constant-time comparison denies unset/malformed/wrong secret. Dedicated Mux secret has no payment-secret fallback. Test max batch/time budget, no work after deadline, no secret logs and independent cleanup flag. A successful empty tick still reports health; a failed dependency does not report successful maintenance.

### T21

**Uncertain create and bounded discovery (F-21; WS2b/Ops).** Lost create response/bind, absent optional URL, pagination budget exhaustion and provider outages retain owned intent/history/quota without blind create retries. Exact nonce/environment/asset binding rejects foreign inventory. Bounded scan exhaustion means unknown, not absence. Verify real waiting cancellation and ingest-winning cancellation; no restart until absence/cancellation is confirmed. Refresh loses File/URL honestly, while an existing in-tab chunk session can resume.

### T22

**Webhook rotation and deletion replay (F-22; WS2a/Ops).** Current/next distinct callback URLs share receipt dedupe; the same provider event delivered to both processes once. Capture one-time secret privately; invalid/missing secret never becomes accepted via feature flags. Raw-body tamper/oversize, timestamp age/future skew and environment mismatch fail before ownership effects. Retiring old endpoint/secret preserves queued replay. Replaying ready/track events after deletion never revives source/ownership. Signing-key retirement waits greatest issued TTL+margin; test emergency deletion using disposable keys only.

### T23

**Pure trusted origin (F-23; WS2b).** Actual tenant/config builder handles the configured circles/shared-root/local topology. Malicious Host/Origin/forwarded values and body cors_origin do not influence it; unverified custom domains fail explicitly. A real browser upload from each intended school origin validates provider CORS behavior. Do not copy the header-derived display URL helper as an authorization boundary.

### T24

**Scheduler and missed-run detection (F-24; Ops).** Record actual staging service/host/owner and prove one minute task invokes bounded routes with the dedicated secret. Verify its HTTP client/runtime, provider health/timeout behavior and no duplicate GitHub staging registration. Induce missed ticks to observe external alert after master grace; test manual replay, empty success and dependency failure. A saved schedule declaration is not execution evidence.

### T25

**Actual SQL gate (F-25; WS0).** A fresh disposable provisioning/reset executes the discovered pgTAP suite in CI with meaningful assertions. Runner fixtures cover nonzero exit, zero discovery, bad plan, missing DB and required skip. Upload the real report and separate legacy/setup defects from feature failures. CI status without a SQL execution step cannot pass this family.

### T26

**Local-only adapter seam (F-26; WS2b).** Reuse `isLoopbackOrigin`; allow explicit local test origins and reject deceptive/nonloopback values before any credentials/request. Mux's policy is reject, not other providers' warn/fallback. Disabled app build does not need Mux secrets. Synthetic test keys and a production-mode local server are allowed in CI; never infer the real staging drill from a stub or configure this seam on a deployed app.

### T27

**Schema types/namespace fidelity (F-27; WS1/WS1b).** Catalog checks verify actual lesson/course/tenant types and required composite uniqueness before new FKs/functions. Full generated types and cold/warm normal compiler inputs remain valid. Public/shared fixtures exercise qualified helper resolution/execute grants under empty search paths and reject unsafe namespace drift without altering SayThanks public/auth sentinels.

### T28

**Pointer constraints/deletion (F-28; WS1).** Wrong-tenant/wrong-lesson media selection fails even from a privileged mutation function. Insert media then select without circular-FK workarounds. Verify target-specific SET NULL support; any fallback covers real DB cascades atomically, retains unavailable source semantics and captures cleanup. Test provider-global uniqueness across two schools and competing generation updates.

### T29

**Durable cascade outbox (F-29; WS1/WS2b).** Explicit remove, caption remove, lesson/course/tenant cascade and repeated triggers converge on one owned cleanup identity. Uploader auth deletion leaves school media intact. Audit/outbox has no deletion-blocking parent/auth FK, survives rollback/retry appropriately, and captures provider IDs plus pending upload/intent nonce before rows vanish. A late owned asset after its lesson is deleted enriches the retained cleanup tombstone without recreating ownership/source rows. Failed/paused provider/Storage deletion retains inventory; confirmed not-found releases it once. No replica-mode/trigger disabling in application deletion paths.

### T30

**Service-only enablement (F-30; WS1).** Browser/admin direct settings/source/provider/outbox/counter writes fail despite table-level/default grants on unrelated tables. Only service-owned functions change them after verified role/access checks; safe capability DTOs expose no secrets. Confirm RLS, explicit revoke/default privilege behavior and no school self-enable via broad tenants UPDATE. Apply public/shared feature migrations twice with flags disabled.

## Evidence and completion

For each enabled package/family retain red and green commands, source/SDK checksum, fixture host/role, discovery/pass/fail/skip counts and artifact path. Update actual task records and the relevant finding's **implementation** status; a design correction closes only a design gap. Normal app checks are `npm run typecheck`, `npm run test:unit`, `npm run lint`, `npm run build` plus applicable actual SQL/E2E/MCP checks after final source changes.

[The rollout receipt](MUX_VIDEO_OPS_RUNBOOK.md#rollout-receipt) records real target IDs and all live scenarios, including blocked/skipped failures and cleanup. Unverified shared prerequisites, signed frames/captions/expiry/recovery or required operational owners keep the pilot disabled. Production migration, deployment and enablement remain separate approved actions.
