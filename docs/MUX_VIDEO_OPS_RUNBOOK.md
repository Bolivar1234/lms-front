# Mux hosting: staging pilot and rollout runbook

Read the [master contracts](MUX_VIDEO_HOSTING_PLAN.md), [TDD gates](MUX_VIDEO_TDD_PLAN.md), [references](MUX_VIDEO_REFERENCES.md) and [finding ledger](MUX_VIDEO_REVIEW_FINDINGS.md). This is a proposed operating procedure. No step below is a completed deployment or authorization to write a hosted database, modify secrets, delete provider assets or enable a school.

## Owners and target record

Shared `lms` mode and common SayThanks authentication are fixed scope. Confirm actual project/service/stage independently before hosted changes. `circles.saythanks.org` identifies the intended LMS product, not permission to assume that any reachable deployment is disposable staging or that production already moved.

Complete this record in the rollout receipt; absent values are launch blockers, not reasons to stop independent local implementation:

| Record | Required input/evidence |
| --- | --- |
| Database operator/approver | Named person, scoped migration role, approved schema-only baseline/catalog location/version and recovery procedure. |
| Application target | Actual staging origin/service ID, Coolify/host version, environment name, deployed commit/image digest and build/runtime schema selection. |
| Supabase target | Project identity, API/Storage origin, `lms` prerequisites/owner, PostgreSQL version, read-only catalog receipt; explicit staging/disposable authorization. |
| Mux target | Account/environment ID, scoped API token identity, callback URLs/endpoint IDs, signing key IDs; current plan/allowance and existing inventory. Never values of keys/secrets. |
| Pilot/fixture | Named approved school/contact; separate disposable fixture tenant ID, authorized users, test media and ownership namespace. No real student content in destructive drills. |
| On-call/privacy | Budget amount/currency/period and alert thresholds, budget/takedown on-call, abuse-report contact, acceptable-use/privacy/subprocessor owner and applicable caption/data policy. |
| Scheduler | Actual staging host/service/owner, single task ID, verified origin, secret-store reference, monitor ID and deployment-grace record. |

The master/runbook already choose a host-side minute staging scheduler. Existing deployment files describe Dokploy while this handoff identifies Coolify; verify the concrete service/version before editing configuration, then update actual deployment instructions during implementation. Do not infer hosting identity from labels such as Coolify “Production” or “Preview”. No production permission follows from a staging label.

## Read-only preflight and SQL gate

1. Record actual deployed app commit/image and project identities. Resolve read-only access or an approved catalog export; request scoped missing access, not broad production credentials. Inspect configured-variable presence/readiness without printing values.
2. Review implemented feature migration checksums and the ordered manifest in [the TDD plan](MUX_VIDEO_TDD_PLAN.md#package-order-and-deliverables). Confirm public/shared fixture gates passed. Verify the actual owner/types/grants/RLS/functions against the approved baseline. A bare `public.` -> `lms.` replacement or a public reset is not shared evidence.
3. The planned read-only verifier is `scripts/media/verify-target.ts`; its command/manifest format must be implemented in WS1b and published with real output. Until it exists and runs, report **blocked**, not “verifier passed”. It must reject wrong target, unsupported baseline/types/PostgreSQL, unexpected grants or missing prerequisites without repairs/writes.
4. With separate explicit staging authorization, the database operator applies only the approved additive shared feature sections and records before/after catalogs. Apply the global caption Storage SQL separately: `storage.*` is not LMS-namespace SQL. Do not reset/seed the shared project or change SayThanks public/auth configuration. A schema backup is not permission for a destructive restore over a shared live database.
5. Verify app `NEXT_PUBLIC_SUPABASE_DB_SCHEMA=lms` at build **and** runtime/Docker configuration. Independently verify MCP `SUPABASE_DB_SCHEMA=lms`. PR #27 merged as `189eaf364ccb4c94cb9f9320835383824d9f5f22`; confirm the deployed image includes it and verify real shared role/RLS behavior. Its merge and unit fixtures alone are not that evidence.
6. Verify production-mode Next proxy and actual ingress body ceilings support the canonical escaped-caption route bound, with valid above-default-buffer and oversize-413 receipts. Confirm external lessons and existing resource/audio/preview/completion flows work with hosting off; hosted source selection never routes cached legacy video/transcript content into question generation or unsupported clients. No broad payment/auth migration belongs to this feature. Stripe webhook/secret work remains a separate operational dependency for payment testing, not a prerequisite for local Mux implementation.

Proposed commands after the applicable packages exist: normal `npm run typecheck`, `npm run test:unit`, `npm run lint`, `npm run build`, discovered media Playwright cases, and `supabase test db` **only against the confirmed disposable local fixture**. Only a separately authorized disposable local reset may use `supabase db reset`. Retain actual commands/exit codes, rather than treating this list as execution evidence.

## Mux configuration and rotation

Create/use a dedicated LMS staging environment, separate from SayThanks assets and the future LMS production environment. Inventory/account exposure remains account-wide even when environment credentials are separate. Verify actual pricing/allowance and fixture counts before live runs; no automatic paid-plan purchase is implied. SDK test assets are short/watermarked/temporary and cannot prove long-duration or retention behavior.

Use the [canonical environment table](MUX_VIDEO_HOSTING_PLAN.md#environment-contract). Store secrets only in the target secret manager: API credentials, current/next webhook secrets, `MUX_SIGNING_KEY_ID`/`MUX_SIGNING_PRIVATE_KEY`, and dedicated `MUX_MAINTENANCE_SECRET`. Do not introduce ambiguous old signing-variable aliases or reuse an unrelated payment cron secret. Verify least necessary permissions, PEM encoding and key/environment identity privately. Disabled external-only builds stay possible without Mux API/signing credentials; verified receipt handling never becomes optional when a hosting flag is off.

Initially both global hosting and destructive-cleanup switches are false and the school settings row is disabled. Deploy reviewed code/config only with the relevant authorization. Verify actual configuration/commit afterwards; saving a config draft is not a successful redeploy. Never configure `MUX_API_BASE` on a deployed app. Local stub seams are not staging-provider evidence.

Configure the callback on the verified LMS platform origin at `/api/mux/webhook`. The reserved `circles` host already resolves as platform under the shared root; explicit host configuration is still useful for other staging/canonical hosts. A genuine signed callback must reach the handler without session, tenant lookup/404 or locale/login redirects, including hosting-off mode. Measure receipt durability/acknowledgement against the master's target and provider deadline. Confirm correct event environment and redaction; do not log raw callbacks to diagnose a missing secret.

Webhook secret rotation uses **distinct addresses**, `/api/mux/webhook` and `/api/mux/webhook/next`, because Mux requires unique webhook addresses per environment. Implement the alias and install the next secret before enabling the second endpoint. Capture its one-time signing secret privately, deliver a real fixture event and prove shared event dedupe across endpoints. Retire the old provider endpoint and old secret only after the new route works and the transition/retry handling is recorded. Both paths use the same namespace/worker. Persisted verified receipts continue replaying without needing old signature freshness or the retired inbound secret. A future rotation may reuse a retired address with an explicitly recorded current/next mapping; do not assume address names imply which secret is current.

Normal signing-key rotation: create/store the new pair, deploy it as current, prove signed playback, retain the old provider verification key through the **greatest issued TTL plus operational margin** in the master, then delete the old key. App secrets/artifacts never retain old private keys unnecessarily. Emergency environment-key deletion requires explicit incident authorization, affects every token on that key and may disrupt buffered/in-flight playback differently; record actual behavior. It is not a per-school kill switch or an app-button permission inferred from a docs merge.

## One scheduler and observable recovery

Register the single staging minute task only after the implemented maintenance endpoints and dedicated authentication pass. Invoke `/api/cron/mux-reconcile` then `/api/cron/mux-cleanup` on the verified platform origin, with bounded work and independent destructive switch. Verify the HTTP client is installed in the runtime; do not prescribe an unavailable curl binary. Keep secrets out of command logs, shell tracing and artifacts. Record actual service health/timeout behavior instead of relying on remembered Coolify defaults.

Use the staging-specific base origin, secret reference and external monitor. Existing GitHub payment cron remains unchanged; do not also register its production `CRON_BASE_URL` as a staging Mux schedule. A healthy empty result counts as a successful tick; database/provider failure must not. Test the master's missed-tick threshold/deployment grace, oldest receipt/intent/preparing age, retry exhaustion/dead letters, cleanup backlog and provider outage/429 alerts. Configuring a monitor without observing the missed-run alert does not pass T24.

Manual replay uses the same bounded, authenticated route/worker and verified environment/opaque event scope. Record reason/audit and remaining backlog; do not route Mux receipts through payment dispatch, rewrite the original receipt, blindly retry uncertain creates or mark provider absence merely because a bounded scan exhausted its budget. Dead letters/uncertain inventory retain ownership and accounting until an operator establishes the safe outcome.

## Pilot controls and expiry drill

Use the master's finite caps and shared Postgres throttles; operators may lower caps, never silently enable missing settings. Validate concurrency, UTC day boundaries, no daily-attempt refund on cancel and stored inventory retained until provider deletion. Set real account budget alerts with a named responder; request/key/environment isolation alone does not limit all ingest cost. Do not advertise declared-byte checks as a hard pre-upload provider ceiling.

Perform the accelerated renewal drill on the approved **disposable fixture tenant**, not real school users:

1. Confirm `MUX_DEPLOYMENT_STAGE=staging`, actual staging app/project/Mux environment, fixture identity and explicit configuration authorization.
2. Configure the paired `MUX_STAGING_FIXTURE_TENANT_ID` and `MUX_STAGING_TOKEN_TTL_SECONDS` per the master (drill 120 seconds). This is a server-only fixture policy on the normal authenticated mint/renewal path, with no client TTL input. Short-token renewal lead is derived by the master formula; no jitter applies in the drill.
3. Observe real decoded frames before/after expiry, pause/background return, reauthorization, access-ended and temporary network failure. Keep the actual manifest/request timing and sanitized player/network evidence. An operator-generated token shown on a separate page or a prop assertion is insufficient.
4. Remove the paired override, redeploy as authorized and verify ordinary fixture/school grants return to normal duration-aware policy. Prove production/invalid/incomplete override configuration fails and record absence in the production configuration review. Do not set a production app's stage to staging to bypass this guard.

Manual WebVTT captions remain pilot scope; no auto-caption/translation/SRT dependency is introduced. Verify strict school/course caption requirements as well as default publish warnings, separate Video/Captions states, signed CC/keyboard behavior and en/es text. Current player localization is checked rather than assumed; record any limitations and keep the affected capability disabled if it violates the required pilot experience.

Before school enablement publish the applicable acceptable-use/abuse contact and privacy/subprocessor material; name policy/data owners. Verify optional Mux Data disabled through actual network observation and no viewer names/emails in provider metadata. Record unavoidable processing. Do not claim blanket regulatory compliance or treat a percentage-captioned target as permission to publish content against a school's mandatory policy. A bounded operator inventory/cost/stuck-row report suffices initially; larger dashboards, CSP rollout and new analytics require their own evaluated scope.

## Live acceptance and cleanup

Use the protected staging workflow or operator equivalent with approved fixture identities. Ordinary fork PR CI must not need Mux secrets. Before each run, record owned fixture IDs immediately in a manifest containing no URLs/tokens/private keys. Use cleanup-always **and** an independent orphan sweep for killed runners. If deletion is paused for an incident, record retained fixtures and their cost; do not bypass the switch.

| Scenario | Required observation / TDD contract |
| --- | --- |
| Target and disabled baseline | Actual app/image/project/schema/Mux environment match receipt; old external/audio/resource flows work with hosting off; valid receipt persists. T03/T14/T26. |
| Owned upload and callback | Real direct upload, exact CORS, opaque correlation, genuine signature, durable prompt acknowledgement, async owned ready selection and authoritative video/duration/policy checks. T01/T02/T08/T23. |
| Access and player | Student/teacher/admin cookie/Bearer matrix with distinct shared-schema rows; no token for anonymous/non-entitled/wrong school; actual decoded video/poster/audio. Native-device support recorded separately. T03/T04/T13/T17. |
| Captions | Real private VTT ingest, ready/error event or bounded reconciliation, genuine signed student CC, unauthorized source denial, UI/keyboard, supported language, above-default-buffer transport and source-aware legacy transcript/question guards. T10/T15. |
| Expiry | Normal authenticated fixture-policy renewal through real stream expiry, background/pause and access-ended/network recovery. T06. |
| Recovery and caps | Actual waiting cancel/restart, ingest-winning race, lost create response/optional URL, refresh/reselection and chunk retry; concurrent cap refusal without blind duplicate creation. T07/T09/T12/T21. |
| Operator and rollback | API-verified identity plus fresh super-admin membership (never caller x-user-id), audit, school-disable/takedown, safe report and log redaction; existing grants follow actual token/key behavior while callbacks/reconcile continue. T11/T16/T19/T20/T22. |
| Maintenance | Actual single scheduler invocations, empty/failing tick distinction, missed-run alert and safe manual replay. T24. |
| Removal and cleanup | Owned provider asset/track and Storage deletion/not-found, outbox durability under parent/actor removal, once-only capacity release, no resurrection on late event. Controlled isolated deletion drill before general cleanup enablement. T28–T30. |

Required tests report **passed, failed, skipped and blocked separately**. A stub, isolated player harness, service-role Storage request, SDK type or configured toggle cannot pass a live application authorization/streaming scenario. No pilot enablement with blocked required shared-schema, caption, stream, expiry, recovery, cleanup or operational-owner evidence. WS6 replacement/history/native/MCP behavior is separately tested before enabling those capabilities; external-only unsupported operations stay explicit.

Pilot observation targets are proposals for the named owner's approval: upload success at least 95%, median processing under ten minutes and playback-start failure below 2%. Record sample counts/time window and provider-outage attribution; these are measurements to collect during the pilot, not fabricated prelaunch statistics or replacements for hard scenario gates. Caption policy, takedown/cleanup drills, budget/contact ownership and honest teacher recovery remain mandatory. Record cost against the actual approved budget, not remembered pricing or browser-derived invoices.

## Rollout receipt

Store a redacted Markdown/JSON receipt alongside the implementation PR/artifact, with a permanent link from the findings ledger. Do not commit secret manifests or user rows.

```text
source commit / PR / SDK versions and checksums:
actual app service, stage, origin, commit and image digest:
Supabase project, schema, owner role and approved baseline/catalog location:
Mux account/environment, callback endpoint IDs and signing key IDs (no secrets):
migration source/variant/global-Storage checksums, approval and catalog diff:
fixture tenant/users/media, provider upload/asset/track IDs and ownership:
variable readiness and schema build/runtime match (presence only):
package / T-ID / command / timestamp / exit / passed / failed / skipped / blocked:
real acknowledgement, stream/CC/expiry/recovery evidence links:
scheduler task/monitor/owner and observed missed-run/manual replay evidence:
budget/abuse/privacy/caption policy owner approvals:
cleanup manifest: confirmed deleted / retained / unresolved, reason and next owner:
remaining blockers and exact missing access/identity/evidence:
school enablement decision/approver, rollback verification:
production approval: separate, absent unless explicitly supplied:
```

## Rollback and outages

Disable the school setting first, or global hosting for an incident; pause destructive cleanup separately when preservation is needed. Keep callback secrets, receipt store, status/removal, replay/reconcile, scheduler and ownership records alive. Rollback does not clear source pointers, destroy assets, select stale external URLs or refund stored usage prematurely. Never use a schema down script as routine shared rollback; review recovery separately with the database owner.

Provider API outage keeps uncertain intents with bounded retry; CDN outage preserves playhead and shows unavailable/retry; local signing cannot repair CDN delivery. Database/auth/limiter failures deny new access. Re-enable only after reconciling stuck owned rows and confirming target/cost/flags. Resume state clears on logout/account switch. Retain incident evidence only under the named policy, without capabilities.

Production is a separately verified target and approval after applicable wider-release/shared prerequisites. A docs merge, successful staging run or operator ownership record is not production SQL/deploy/enablement authorization.
