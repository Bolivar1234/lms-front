# Mux hosting: staging pilot and rollout runbook

Read the [master design](MUX_VIDEO_HOSTING_PLAN.md), [TDD work packages](MUX_VIDEO_TDD_PLAN.md) and [pinned references](MUX_VIDEO_REFERENCES.md). These steps are proposed until implemented; no checklist entry is a completed deployment claim.

## Owners and target record

The LMS target is circles.saythanks.org on the shared SayThanks backend, with LMS schema lms and common auth. SayThanks public tables/auth configuration are not this feature's migration target. Current checked-in shared-db docs identify staging; verify actual app/project/stage before writing SQL.

Record the database operator/approver, database role and approved schema-only baseline/catalog location, app service/environment/commit/image, Supabase project identity, schema selector, Mux environment ID and callback, budget/abuse on-call owner, abuse contact and scheduler owner. Missing names/access are rollout blockers, not a reason to stop independent local implementation. Do not repeatedly ask whether shared lms mode is required: the user already chose it.

Current review identifies shared staging as Coolify; checked-in deployment docs still describe Dokploy. Use Coolify/host-side staging operations as the intended procedure, but confirm the concrete app/service ID and version before any env edit. Update the deployment docs when verified. Production migration/deployment, credentials and scheduler are separate targets, never inferred from staging.

The current operational handoff assigns Mux account/environment/key creation, Coolify Production/Preview env edits/redeploy, shared SQL and scheduler variables to the named operator. Available explicitly authorized tools may assist when access exists; do not claim those tasks have been automated or that this plan grants write authorization.

## Preflight and schema gate

1. Confirm read-only app/database identity and expected shared prerequisites. Run the media verifier in read-only mode against the intended lms schema. Do not reset or seed the shared database.
2. Review canonical public SQL and its checked lms namespace variant, migration checksum, grants/RLS/execute permissions and empty function search paths. Public feature tests do not prove actual shared prerequisites.
3. Verify the approved baseline/catalog contains no credentials, user data or URLs/tokens, and is stored by the database owner. PR1b needs feature fixtures and catalog evidence, not an unreviewed full production dump in git.
4. With explicit staging authorization, the operator applies idempotent shared SQL and records checksum/result/catalog diff. Confirm no SayThanks public/auth changes. Production application is a separate approval.
5. Ensure all application clients use NEXT_PUBLIC_SUPABASE_DB_SCHEMA=lms with matching build/runtime/Docker settings, including Bearer/MCP paths. Confirm legacy external lessons still work with the global Mux switch off.

## Mux and environment setup

Create a dedicated LMS Mux staging environment and a separate production environment in the platform account. Environment isolation separates credentials/inventory, not all account-level abuse exposure. Do not reuse SayThanks assets/keys/webhook endpoint.

Configure server secrets: MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET, MUX_SIGNING_KEY, MUX_PRIVATE_KEY. The implementation uses @mux/ts; verify key encoding and least-privilege token scopes without printing values. The private signing key is shown once at creation and stored in secret storage, never a file committed to Git.

Configure MUX_PROVIDER_ENABLED=false and MUX_ASSET_DELETION_ENABLED=false initially, the intended Mux environment ID, upload expiry (3600 seconds), supported token/duration bounds and any later fixed replacement retention. The service-only tenant_media_settings row remains disabled until the gate passes. Never set MUX_API_BASE in a deployed app; it exists only for loopback tests. There is no new CI switch.

In Coolify set the correct staged app's Production/Preview configuration as appropriate and redeploy; those labels do not by themselves identify the business production database. Record actual target/service/env to avoid a shared-production edit by mistake.

Set staging Mux callback to https://circles.saythanks.org/api/mux/webhook, or the separately verified platform staging origin if different. Verify a genuine signed event reaches it without login/locale/school redirects. Callback must verify/persist within five seconds (target under two) and work while hosting flags are off. Mux retries failed attempts for up to 24 hours; queue persistence and internal replay must repair beyond that delivery window.

Keep the webhook secret installed through rollback. API/signing credentials may be lazily required for their own operations; never acknowledge an unverified event because a feature flag is off.

## One scheduler of record

For staging, the Coolify/host-side minute task is the Mux scheduler of record. Register it explicitly to invoke bounded /api/cron/mux-reconcile and /api/cron/mux-cleanup on the verified LMS platform origin with the existing cron-secret authentication. Ensure cleanup uses the independent deletion switch. Endpoints and authentication must be implemented/tested before this schedule is considered live.

Use a staging-specific base URL/secret and monitor ID. Do not reuse GitHub cron.yml's production CRON_BASE_URL to imply a staging schedule exists, and do not schedule the same staging routes twice. Existing GitHub payment schedules remain unchanged. Future production scheduling is separately registered/approved and documented.

Scheduling is best-effort, not a one-minute SLA. Configure a heartbeat and alert after three missed expected ticks (with a deployment grace), oldest pending event/intent age, preparing age, retry exhaustion, deletion backlog and provider 429/outage. Waiting upload expiry plus 15 minutes is eligible for reconcile; preparing >30 minutes alerts/polls without blindly deleting a possibly working video. Internal leases/backoff make repeated/manual runs safe. Run bounded batches so a backlog does not become a long HTTP request.

Operator manual replay: confirm stage/namespace, invoke the same authenticated maintenance route with a bounded batch/event scope, inspect redacted result and remaining backlog. Do not run a direct unscoped provider delete or replay Mux rows through billing dispatch. Never put the cron header/secret in a log/artifact.

## Pilot caps, accessibility, abuse and data choices

One named school only. Proposed settings: 300 stored minutes, 90 minutes per video, five new attempts/day, two pending/school, one pending/lesson, declared size guidance 2 GiB. These are application reservation/usage caps, not actual pre-upload byte/duration enforcement; the operator accepts the direct-upload exposure and can lower limits. Pilot rollout requires the plain-cap code in workstream 2b, not future plan UI.

Create Mux budget/usage alerts and name the on-call owner who may disable school/global hosting and perform takedown. Join opaque Mux media/school references to LMS inventory for attribution; keep provider metadata free of viewer identity. Read current mux.com/pricing before setting a real budget/paid allowance; no remembered numbers in the release promise.

Publish acceptable-use terms and an actual abuse-report address/contact. Verify operator-only audited school disable and owned-asset delete actions, correct environment checks, and escalation for existing signed grants. Deleting an environment signing key invalidates all tokens signed with it; use only with explicit incident authorization and account for other viewers. A dedicated environment does not guarantee the shared Mux account cannot be affected by abuse.

Manual WebVTT captions must work before pilot: teacher can upload/update/remove language-tagged VTT; missing/processing captions warn at publish; entitled students can select signed CC tracks. Validate actual browser CC/keyboard behavior. A warning is not a declaration of compliance; product/privacy owner handles applicable school data agreements and child-data questions.

Add Mux to privacy/subprocessor docs. Optional Mux Data/viewer tracking defaults off where supported by the chosen player; verify outbound requests and document actual behavior. Send no names/emails and retain no upload/source URLs or JWTs in Sentry/logs. Verify logout clears local resume state. Product owner records retention/abuse evidence policy instead of assuming a blanket legal requirement.

## Live acceptance: actual provider behavior

Use a protected manual staging workflow or operator-run equivalent against the deployed approved fixture tenant. Keep it out of ordinary fork-PR CI. Cleanup uses if: always() and a separate orphan sweep for killed runners, scoped to the fixture namespace/environment. Write provider/upload/LMS IDs to a safe manifest immediately; never capabilities or private keys. If deletion is paused for an incident, report retained fixture assets and do not bypass that switch.

Required scenarios:

1. Read-only app commit/image, Supabase project/lms schema and Mux environment match the target record. External lessons work with hosting disabled, and a valid callback still persists.
2. Enable the fixture school and upload a real short video directly to Mux. Observe genuine signature-verified event persistence, async worker processing, authoritative duration/policy and correct current-source selection.
3. Entitled student sees decoded video frames/poster/audio. Anonymous/non-entitled/wrong-school sessions receive no playback token. Test cookie/Bearer authorization; native device behavior is recorded separately from browser mobile emulation.
4. Upload private valid WebVTT, observe real text-track ingest and ready/errored events, verify signed student captions/CC language controls, and prove unauthorized VTT source access fails.
5. Accelerated-expiry staging token drill proves continuous playback renewal, pause/background return, playhead preservation and access-ended handling. Duration/jitter/retention settings retain margin. Updating player attributes alone fails this acceptance gate.
6. Lose a start response / remove the optional retrieve URL in a controlled adapter case, then exercise a real waiting upload cancellation/restart and a cancellation-vs-ingest race. Capture observed actual Mux status behavior; mocks do not establish recoverability. Never rely on the retrieve URL appearing.
7. Slow-network chunk retry/pause/refresh demonstrates the honest File/reselection UX. Exceed pilot attempt/storage reservation caps and verify a server refusal; malformed declarations do not masquerade as actual provider byte-limit proof.
8. School-disable/takedown drill stops new grants; existing tokens live to expiry unless explicitly deleted at key/asset scope. Webhook/reconcile continue. Confirm logs redact all capabilities.
9. Remove fixture media and captions; real provider asset/track and storage cleanup complete, still-stored inventory counts until confirmation, once-only quota release is correct. If the later replacement slice ships, separately prove A/B generation swap and fixed-retention behavior.

Pass/fail/skipped/blocked, actual commands, target identity, IDs/cleanup manifest and redacted evidence go in the rollout receipt. No school enablement on a blocked streaming/caption/expiry/shared-schema check. The live workflow can be non-blocking for code merges without being optional for launch.

## Rollback, outages and key rotation

Disable the school service-only flag first; use MUX_PROVIDER_ENABLED=false for a platform incident. Pause MUX_ASSET_DELETION_ENABLED when preservation is required. Leave callbacks, event store, status reads, reconciliation, scheduler and secrets working. Do not clear source pointers, delete assets, or silently switch to old external URLs as rollback side effects. New hosted grants/renewals fail; existing grants expire normally. Queue cleanup safely while paused; do not release billable inventory early.

Mux API outage: no blind create retry, keep uncertain intents, bounded backoff, visible retry-later. CDN outage: preserve playhead and show unavailable/retry; local JWT signing cannot fix a streaming outage. Database/auth outage fails access closed. Lost callbacks are repaired from durable ledger/owned provider polls, not an unlimited asset scan. Resuming a school runs bounded reconciliation before new uploads.

Normal signing-key rotation: create/store a second key, deploy it as current, prove a signed staging request, retain the old Mux key at least the longest issued TTL plus clock-skew/operational margin, then call signingKeys.delete on the old key. Mux has no separate revoke API. Never delete the previous key immediately after deploy. Emergency deletion interrupts every token using that key and needs explicit operator authorization.

Record the signed token audiences used (v/t/g/s); d is DRM-only and not part of this rollout. Test referrer restrictions with tenant hosts and native/missing Referer before enabling them. They limit reuse but do not replace entitlement checks.

Production rollout remains a separate operator approval after shared production target/setup is verified. The plan does not authorize a production migration, deploy, secret edit, push, merge or general enablement.
