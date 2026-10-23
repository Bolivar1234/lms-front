# LMS Mux video hosting: master plan

This is the design and release index. The full plan consists of this document, the [TDD work packages](MUX_VIDEO_TDD_PLAN.md), [operations runbook](MUX_VIDEO_OPS_RUNBOOK.md), and [pinned source appendix](MUX_VIDEO_REFERENCES.md). Read all four for implementation/review; a condensed excerpt can omit release blockers. All changes described are planned work, not evidence that they have been implemented or deployed.

## Review and contribution workflow

These documents are a living design proposal. The GitHub documentation PR is the review hub; its current branch contains the canonical review version. Use the clean file views for reading and PR comments, suggested changes or small documentation commits for contributions. Record the commit SHA reviewed so observations about an earlier revision can be reconciled. Do not replace the full documents with a condensed model-generated copy for subsequent reviews.

Code inspected while preparing this proposal included [commit 5fcb2425](https://github.com/Bolivar1234/lms-front/commit/5fcb242562458ad2b4312ebc80823e149f829203) from [application-remediation PR #24](https://github.com/Bolivar1234/lms-front/pull/24). The documentation PR does not include that application patch. Check the current code and merge state before implementation; a planned test or earlier verification receipt is not evidence that the current deployment passes.

For each review finding, provide the document heading/file, concrete failure or missing requirement, source/code evidence, proposed correction, and acceptance test. Label it as a design blocker, pilot/wider-release blocker, implementation task, or optional improvement. Distinguish a verified fact from an assumption or a live-provider check that remains blocked. Review the relevant code and official provider contracts before proposing another architectural change.

Use this brief when requesting a model review:

> Read all four documents linked above at the current PR commit. Review the design against repository code and current Mux contracts. Report actionable findings with file/heading, evidence, failure scenario, proposed fix and acceptance test. Preserve the user-confirmed shared lms deployment. Distinguish design defects from implementation work and launch inputs; do not claim planned or mocked tests prove live behavior. Suggest focused edits to the relevant document and cite the commit reviewed.

Keep unresolved findings in PR threads until the relevant document is corrected or the tradeoff is explicitly recorded. A model's approval or agreement count does not establish launch readiness; the TDD and live acceptance gates below do. Review comments and documentation edits do not authorize application implementation, shared-database writes, deployment, or feature enablement.

## Outcome and release stages

Teachers upload video directly inside the LMS, add captions, and students watch signed adaptive playback. Existing external video links and private audio/document uploads continue to work. Existing completion/checkpoint behavior remains authoritative; watch-based automatic completion is outside this project.

The user has confirmed LMS at `circles.saythanks.org`, SayThanks at `saythanks.org`, and shared authentication with LMS data in `lms`. Shared `lms` mode is a launch requirement. The current shared-db README calls this staging and says production has not moved. Verify the actual project/app before any hosted change; this plan does not declare the production migration complete.

| Stage | Minimum scope |
| --- | --- |
| Internal API plus harness | PR0, public-mode schema, webhook/upload/recovery API, and playback harness. No teacher pilot or public enablement. |
| One named-school pilot on shared staging | Shared-mode gate, upload UI, manual WebVTT captions, authenticated student player, removal/cleanup, finite pilot caps, abuse/takedown path, cost alert, one registered scheduler, and live acceptance. No plan-tier UI or replacement overlap required. |
| Wider release | Plan-based caps, replacement/history behavior, supported mobile/MCP/core integration, and shared production rollout approval. Unsupported clone/restore operations must remain visibly guarded. |

Workstreams 1–6 remain, with PR0 first; split schema shared-mode (1b), webhook/upload (2a/2b), and integration work as needed for review size. Local issue-ready briefs and red/green gates are in the TDD document. Do not create or merge GitHub issues/PRs merely by reading this plan.

## Database, schema, and source ownership

Standalone dev/CI uses `public`. Shared SayThanks uses `lms`, leaving SayThanks `public` tables and shared auth untouched. Application queries use existing schema-aware clients and `NEXT_PUBLIC_SUPABASE_DB_SCHEMA`, e.g. `.from('lesson_media')`; do not hardcode `.from('lms.lesson_media')`. Audit Bearer and MCP client construction too. Validate the schema selector; a TypeScript cast is not validation.

The canonical SQL is the reviewed normal public migration. Produce idempotent `supabase/shared-db/lms-lesson-media.sql` by the narrowly checked `public.` -> `lms.` namespace transformation of that feature SQL, with a drift check. No SQL template language or generic generator framework. Functions use `SET search_path = ''` and explicitly qualified tables/helpers, including preserved `auth.`/`extensions.` names. The transformation checker rejects unexpected schema references, unsafe unqualified names, and unsupported string-literal substitutions. Ordinary text replacement is not authorization to rewrite an entire baseline.

PR1 is public-mode schema/permissions only. PR1b is the launch gate for shared SQL: compare the new feature's catalogs/grants/RLS in disposable public/shared fixtures, apply shared SQL twice, and verify approved read-only staging prerequisites. The shared baseline was loaded outside git; do not import a large production dump or require an entire shared baseline in PR1. The shared database operator owns its approved schema-only baseline/catalog and storage location. Until their identity/role and target prerequisites are established, shared rollout is blocked while local coding continues.

Ship shared SQL and verification instructions in LMS Front following `supabase/shared-db/README.md`. SayThanks's database operator approves/applies it; do not change SayThanks code, auth hooks, or governance without a separate task. No global `mux` provider schema, `@mux/supabase` mirror, or Edge Function for this release.

## Minimal data model

All SQL below uses the selected LMS schema. Provider identity stays private. Actor IDs used for idempotency are immutable audit values, not blocking auth foreign keys.

| Object | Required contract |
| --- | --- |
| `lesson_media` | `id`, `tenant_id`, `lesson_id`, nullable `uploaded_by`, immutable non-null `request_actor_id`, `request_key`, opaque `upload_intent_id`, provider environment/upload/asset/playback IDs, status, untrusted declared file metadata, authoritative duration/aspect ratio (text), lifecycle/error timestamps. |
| `lesson_video_source` | One row per `(tenant_id,lesson_id)`; `mode` external/mux, current `media_id`, monotonic `generation`. No row means legacy `lessons.video_url` external source. Composite FKs enforce tenant+lesson+media scope. |
| `tenant_media_settings` | Service-only per-school `enabled` flag and finite pilot limits, default disabled. School-admin grants on `tenants` cannot enable hosting. |
| Caption rows | Owned media/tenant, language, label, private VTT path, provider track ID, pending/ready/errored/deleting state, error and timestamps. No raw VTT in logs. |
| Cleanup outbox | Provider environment/IDs, opaque owner reference, reason, duration for usage accounting, due time, attempts/lease/error. No parent/auth FKs; survives parent deletion. |
| Existing webhook ledger | Namespaced Mux events and lease/retry state, independent of payment dispatch. Durable insert before acknowledgement. |

Unique idempotency key is `(tenant_id,request_actor_id,request_key)`; nullable `uploaded_by` must not weaken it after account deletion. Tenant-scoped keys and composite FKs protect local ownership. Keep an additional global unique `(mux_environment,mux_asset_id)` and equivalent provider-upload uniqueness: tenant-only provider uniqueness would permit the same asset to be owned by two schools. One asset belongs to one lesson/media row. No asset sharing by copying IDs.

Use existing tenant columns where verified; backfill/add only where needed to enforce composite lesson/course/tenant scope. A DB trigger enforces allowed status transitions, generation-protected selection, and server-only provider fields. Media/source/settings/outbox are server-write-only with revoked browser writes and RLS. General lesson DTOs and status DTOs omit provider IDs. Authorized playback necessarily returns a playback ID and signed tokens; their presence in an authorized player is expected.

A `lesson_media` delete trigger writes the outbox before the row disappears, including cascade deletion. Explicit removal creates an outbox job and blocks new grants first; physical deletion is not the only trigger path. Repeated requests/triggers converge by provider identity. Caption storage/track cleanup is included. Deleting an uploader account alone must not erase school-owned lessons or block shared auth deletion.

The side source table avoids snapshot creation on every provider-state change. It does not magically fix restore: until full support ships, the restore function must reject restores that affect a hosted lesson's video, and clone/import/export must explicitly reject unsupported hosted-media copies. Ordinary external-only metadata operations continue. Do not leave a new side pointer silently active while a legacy restore claims to restore the video. Full source/version round trips belong to workstream 6.

## Authorization, host, flags, and routes

Use `lib/lessons/resource-download.ts` as the access-gate pattern: tenant/lesson/course lookup, author or active school admin, or real `has_course_access` entitlement with access cutoff. `enrollments` is progress, not access. Cookie and verified Bearer requests share the gate and schema configuration. Missing/cross-tenant is the same 404, anonymous 401, unauthorized same-tenant 403, actual DB/provider failure 5xx. A client Mux ID never grants access.

Canonical callback is `POST https://circles.saythanks.org/api/mux/webhook`, on the LMS platform host. Verify proxy/platform-host configuration passes it without tenant/login/locale redirects. Callback ownership comes from verified event identity/provenance, not host, cookies, or `x-tenant-id`.

Teacher API provides upload start/status, explicit retry, caption upload/remove, media remove, and source selection. Student API is `GET /api/lessons/:lessonId/media/playback`. Callback and maintenance routes are independent of user sessions. Exact teacher paths are specified in the implementation PR before tests are written.

Derive the upload origin from a verified tenant lookup (immutable ID -> current slug) and configured platform base domain/host rules. Never from `Origin`, body CORS fields, `Host`, or `x-forwarded-host`. The existing `getTenantSiteUrl` reads request headers, so it cannot serve unchanged as this security boundary; use a small pure builder with verified tenant/config inputs and test the `circles` topology. Custom-domain upload is unsupported until the app has actual verified domain records; show an explicit error rather than inventing that infrastructure. CI has explicit localhost/lvh.me origin configuration.

Every teacher cookie-authenticated mutation requires JSON with `Content-Type: application/json` and exact Origin equality to the server-derived school origin. Send bounded WebVTT as JSON text to keep this contract for captions. Deny missing/mismatched origins for cookie writes. Bearer-only native writes use verified tokens, never fall back to cookies, and remain separately tested; do not require a browser Origin from a native client. Test malicious sibling schools and spoofed forwarded headers. SameSite cookies alone are insufficient.

- `MUX_PROVIDER_ENABLED`: server-only global upload/activation/playback/renewal switch, default false.
- `tenant_media_settings.enabled`: per-school service-only opt-in, default false.
- `MUX_ASSET_DELETION_ENABLED`: independent worker switch, default false until the cleanup drill passes.

Upload/player capability is a safe server result, not a public env variable. Flag-off rejects new hosted grants/renewals and uploads but webhook verification/persistence and reconciliation continue. Authenticated status and removal requests remain available. Rollback disables the school flag; pause destructive cleanup separately for an incident requiring asset preservation. Keep secrets, callback, durable queue, and scheduler alive. Already issued tokens survive until expiry. Re-enabling reconciles stuck owned rows before accepting new uploads. No silent fallback to a stale external URL.

## Direct upload, idempotency, and recovery

Use `@mux/ts` (npm observed 15.6.1; pin the reviewed version/lockfile during implementation), `@mux/mux-player-react`, and the chosen Mux Uploader/UpChunk package. `@mux/mux-node` is deprecated. Initialize lazily so a disabled deployment can build and serve external lessons without Mux credentials. A small server-only adapter centralizes SDK, signatures, signing, errors and bounded timeouts.

Create a durable owned intent before calling Mux. Pass `new_asset_settings.playback_policies: ['signed']`, basic quality, bounded documented resolution tier, server-derived exact CORS, and 3600-second upload timeout initially. Metadata contains only opaque media/intent/school billing references that map back to tenant and lesson in the LMS; no names, emails, tokens, or private school information. Correlation enables per-school usage attribution without public personal data.

Browser/server validate declared MIME, filename, size and duration for UX. They do not prove uploaded bytes. The current create API provides no general hard uploaded-byte/MIME/duration limit. Verify actual video track/duration after ingest and quarantine/delete non-video or over-duration assets. Daily attempt/concurrency caps, named schools, budget alerts and cleanup limit exposure; they cannot eliminate all ingest cost before rejection. A hard pre-upload byte/duration guarantee is outside the chosen direct-upload contract and would require a separately approved staging/validation architecture.

Return URL/media ID/expiry only from a successful newly-created handoff with a valid URL present, with no-store headers. If even the create response lacks its optional URL, retain the bound intent and return a recoverable handoff-unavailable status; do not assume absence means creation failed. Never persist/log that URL. Mux's retrieve Upload.url is optional: do not depend on URL recovery. A duplicate start key returns `already_created` and status, with no URL. While the original page retains URL+File, UpChunk can resume. If the URL is lost, offer an explicit restart: under a per-lesson lock confirm/cancel the old provider upload while it is waiting, then create a new media attempt with a new request key. Cancellation cannot be assumed once ingest won the race; return processing and reconcile instead. Do not cancel and replace blindly under the old row.

A create timeout or failed DB bind remains an uncertain intent; no blind SDK create retry. Reconcile exact environment/opaque nonce and provider identity before declaring absence. Keep attempt history and capacity until cancellation/absence is confirmed. The retry/cancel race and lost-create-response path require actual staging evidence; optional SDK fields and a mock are not proof.

Use chunked progress/retry/pause while the tab retains its File. Refresh recovers processing status; it does not recover a File object or guarantee resumability. Offer file reselection/restart with clear copy. Test slow network, refresh, timeout, cancellation and ingest winning the race.

## Webhook and maintenance contract

Mux signature tolerance is 300 seconds in the published SDK; use it and reject invalid/far-future signed timestamps under the app's clock-skew policy. Mux attempt timeout is five seconds and unsuccessful callbacks are retried with backoff for up to 24 hours. Verify raw bytes and bounded size, durably insert/dedupe the validated redacted event, then acknowledge promptly (target under two seconds). Return 5xx if durability failed. Provider/API work happens in the worker, not before the callback acknowledgement. Persisted signature-verified ledger data is replayed by the internal worker without applying the original five-minute freshness limit again.

Namespace events `mux:lms:<environment>` in the existing lease/replay ledger, and keep them outside billing dispatch. Receipt is not business completion. Worker leases, performs the idempotent transaction, then completes; crashes safely retry. Unknown irrelevant signed types can be ignored. Unmatched early events remain replayable; foreign provenance goes to a dead letter. No event creates a new LMS owner row. The state machine is enforced in SQL:

| Current | Allowed transition |
| --- | --- |
| uploading | preparing on owned upload->asset binding; ready may arrive first if provider identity/provenance is verified; error/timeout/cancel -> errored. |
| preparing | ready after authoritative metadata/limit checks; errored on confirmed provider failure. |
| ready | No regression from delayed preparing/error; explicit removal -> deleting. |
| errored | Reconcile safely; no automatic resurrection/selection. New retry is a new attempt. |
| deleting | deleted only after provider delete/not-found; late ready never restores selection. |
| deleted | Tombstone; no revival. |

Selection is a separate generation-checked transaction. Events before upload-ID binding must be reconciled against the durable intent and provider lookup, not trusted solely on passthrough. Polling is bounded repair for stuck rows, not every student/player request.

For staging, use one Coolify/host-side minute scheduler as the Mux scheduler of record, invoking bounded reconciliation then due cleanup with a scoped cron secret. This is best-effort with leases/backoff and alerting, not a precise one-minute SLA. Register it as a required pilot ops step. The existing GitHub cron's production CRON_BASE_URL does not schedule staging. Do not also register the same staging jobs in GitHub. The ops runbook defines heartbeat/missed-run checks and manual replay.

## Playback, retention, and UX

Mint statelessly after checking current selected media, readiness, access, flags and per-user/school rate limit; renewal calls the same gate. No playback-session table, per-view row lock, or `last_playback_grant_expires_at`. Sign RS256 with proper subject/key/audience: video `v`, thumbnail `t`, GIF `g`, storyboard `s`; DRM license audience `d` is documented for completeness but DRM is out of scope and is not minted.

Initial token TTL is `max(3600, ceil(duration_seconds)+900)` plus 0–120 seconds positive jitter. Common lessons stay near one hour; tokens exceed about two hours only when duration requires it. Pilot duration cap is 90 minutes; later explicit plans may allow up to four hours with a corresponding documented token bound. Keep at least five minutes of operational/clock margin in retention beyond the maximum possible token lifetime. Referrer playback restrictions allow only the configured LMS hosts where supported; they reduce casual reuse and supplement, not replace, entitlement checks. Include missing-Referer/native-client behavior in live tests before enabling the restriction for native playback.

Silent renewal five minutes before expiry and after background return preserves playhead and pause state. Updating player props is not proof that stream renewal works. A real short-expiry staging drill is a hard launch gate; if it fails, fix/reload with explicit resume behavior or keep the pilot disabled. Denied renewal shows access-ended. Temporary failures retry boundedly while the existing token is valid. Never claim flag-off instantly revokes a previously signed URL.

Pilot supports upload, select, play, captions, and remove. Background replacement overlap is deferred until the wider-release slice: B preparing leaves A selected; one ready/generation-checked transaction swaps to B. A is retained for a fixed 24 hours, longer than the longest token plus margin. Existing A grants continue; fresh mint/renewal resolves B, so show video-updated rather than silently moving a viewer from A's playhead into B. If seamless old-version renewal is later required, design a signed old-version entitlement separately. No extra session table is needed for the pilot.

Privacy-safe resume uses user+LMS-media-scoped local storage, never a capability URL or provider ID; clear it on logout/account switch. A new media version does not inherit another video's playhead. Show format/declared-size guidance, plain processing/retry copy, access-ended and unavailable states, en/es, keyboard CC controls, responsive layout and light/dark support. Existing completion/checkpoint behavior stays intact.

## Manual captions in the pilot

Teacher-uploaded WebVTT, per language/label and lesson media, ships before pilot use. Auto-generated captions, translation and transcript AI remain deferred. A bounded JSON caption endpoint accepts at most 2 MiB UTF-8 VTT text, validates structure, finite ordered cue timings and video-duration bounds, and treats cue content as text. Never render uploaded cue text as raw HTML. Verify teacher scope, flags and origin just like other mutations.

Store the file in private, media-scoped Supabase storage. After the asset is ready, use `video.assets.createTrack` with a short-lived signed source URL, text/subtitles settings, language/name and the appropriate closed-caption flag. Do not persist/log the signed source URL. Refresh it on a verified failed ingest retry, with idempotent track correlation, rather than duplicate tracks blindly. Track pending/ready/errored by genuine track events and bounded reconciliation. Player access to captions must remain signed with the video; unauthorized requests must not expose the VTT source. Replacing/removing a caption or deleting media queues both provider-track and storage cleanup.

Warn visibly on publish when captions are absent/not ready; do not claim the warning certifies legal compliance. Provide teacher upload/update/remove, CC selection, keyboard and screen-reader checks, and a real signed-caption staging check. Manual captions are an included pilot capability; do not make them depend on future paid auto-caption plans. Later transcript/question generation must use the same entitlement gate and existing BYOK rules; no Mux URL passed to the YouTube extractor.

## Pilot cost, abuse, deletion, and privacy

Before the plan-tier workstream, `tenant_media_settings` holds finite service-only pilot caps. Proposed initial caps per approved school: 300 stored minutes, 90 minutes/video, five new attempts per UTC day, two pending attempts per school and one per lesson, and 2 GiB declared-byte guidance. Operator may lower them; no school self-enablement. A tenant-locked DB check counts actual stored inventory plus pending max-duration reservations; cancelled/absent intents release once, and deleting/errored assets still count until provider deletion is confirmed. Deduplicate inventory/outbox accounting by environment and provider asset ID so queueing deletion does not count the same stored asset twice. Record immutable actor/idempotency keys. This is a small pilot-cap check, not a new billing engine, and is in PR2b rather than depending on PR5.

PR5 extends existing plan features/usage with a media-specific fail-closed resolver: missing limits disable hosting, explicit `-1` is allowed only on an approved eligible plan. Do not change the existing generic resolver's missing=unlimited behavior for unrelated features. No automated Mux usage invoices or authoritative delivery cap from browser watch events. Mux metadata/usage exports join back to owned media for school attribution; show platform cost/usage and monitor provider budgets.

A dedicated LMS staging/production Mux environment separates credentials and inventory but does not guarantee account-wide abuse isolation. Pilot schools must be named and bound by an acceptable-use clause, with a configured abuse contact and named on-call operator for budget/kill-switch/takedown. Add an operator-only audited action to disable a school, stop new grants, queue an owned asset for emergency deletion, and optionally request environment-key deletion when existing grants must be invalidated. Key deletion affects every token using that key; it is not a per-school toggle. Never delete unrelated SayThanks assets. Preserve only the abuse evidence/retention required by the established operator policy.

Explicit remove/deletion uses a durable outbox with no FKs and retries. Capture provider IDs before parent cascades, including captions; do not lose cleanup intent or release stored usage merely because a DB row disappeared. Account deletion distinguishes uploader departure from school ownership. Non-payment uses existing access-cutoff rules; it does not introduce automatic data destruction or new watch-based completion rules.

Add Mux to privacy/subprocessor documentation and assign privacy/data-processing questions to the product owner, including any school agreements or rules applicable to children's data. Do not claim universal ADA/FERPA/COPPA/EU compliance from a technical plan. Default optional Mux Data/user tracking off where the chosen player supports it, send no viewer email/name, and verify the actual network behavior before pilot; document any unavoidable processing. Extend Sentry/log redaction to Mux JWTs, upload URLs, VTT source URLs, headers and private keys.

## Required launch evidence and source/process rules

PR0 enables and fixes the existing SQL test suite before using it as a new gate. New feature SQL tests live in `supabase/tests/`, unit tests in `tests/unit/media/`, and browser specs in `tests/playwright/media-*.spec.ts` under the existing desktop-chromium project. Reuse `lib/payments/loopback-origin.ts` for the server-only MUX_API_BASE test override; no extra CI switch. Reject non-loopback overrides and never set the seam on a deployed app. Synthetic credentials only in tests.

Media specs set retries to zero and the skip checker must reject any required media skip/fixme. PR CI checks auth/SQL/DTO/adapter wiring using the loopback stub; it does not prove streaming frames or optional SDK behavior. A separate protected staging smoke proves actual upload, callbacks, signed stream/caption playback, renewal, lost-handoff/restart/cancel races and cleanup. It is non-blocking for code merges but blocking for pilot enablement. Its always-cleanup plus independent sweeper records every fixture asset.

Use the repository work-issue -> ship-pr -> pr-review-loop process when executing actual implementation issues; read those skills at that time. Respect pre-commit typecheck/build, `<type>/<slug>-<issue#>`, existing PR-template sections, and put evidence/source links under its single How to QA section. Keep all user-requested pinned references; copying restricted/unclear-license code is excluded, while architecture citations remain in the appendix.

The user-confirmed shared deployment is fixed scope, so no need to ask again whether lms is required. The remaining rollout inputs are named database operator/baseline location, verified staging app/project and hosting access, Mux credentials/environment, cost/abuse operator and contact. Ops assigns the present manual account/key, Coolify env/redeploy, shared SQL and scheduler steps to that operator; no deployment or SQL write is authorized by this document alone.
