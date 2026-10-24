# Hosted lesson video: first-release slice spec

**Status:** accepted 2026-10-23 after a design interview with the product owner. **Precedence:** this spec governs the first release (foundation, upload, playback, minimal teacher and student experience, staging operation). The [master plan](MUX_VIDEO_HOSTING_PLAN.md), [TDD plan](MUX_VIDEO_TDD_PLAN.md), [file map](MUX_VIDEO_FILE_MAP.md), [runbook](MUX_VIDEO_OPS_RUNBOOK.md) and [PR 28 reconciliation](MUX_VIDEO_PR28_REVIEW_RECONCILIATION.md) stay as the target vision for later phases; where they conflict with this spec for the first release, this spec wins. Vocabulary is defined in [GLOSSARY.md](../GLOSSARY.md); the webhook decision is recorded in [ADR 0002](adr/0002-hosted-video-inline-webhooks-with-sweep.md).

## Problem Statement

Teachers can only attach an external video link to a lesson. They cannot upload a video to their school, so lessons depend on third-party hosts the school does not control, and students cannot be restricted to those who are entitled to the course. The full plan for fixing this grew to six documents, 228 files and 30 tests, and review keeps finding claims that no running code has verified.

## Solution

A teacher uploads a video file to a lesson. The platform sends it to the managed video provider, shows processing and then ready, and entitled students play it through short-lived signed playback grants. External-link lessons keep working. The first release is one thin vertical slice running on staging behind a two-layer flag, so real behavior (scheduler, edge policy, token renewal, checkpoints) is observed before more design is written.

## User Stories

1. As a teacher, I want to upload a video file to my lesson, so that I do not depend on an external video host.
2. As a teacher, I want to see when my video is uploading, processing, ready or failed, so that I know whether students can watch it.
3. As a teacher, I want a clear message with the size and length limits before I upload, so that I do not waste time on a file that will be refused.
4. As a teacher, I want to replace a video while the old one keeps playing until the new one is ready, so that students never hit a gap.
5. As a teacher, I want to remove a hosted video and fall back to my external link, so that I can undo a mistake.
6. As a teacher, I want to preview my lesson, including unpublished ones, so that I can check the video before students see it.
7. As a school admin, I want to upload, replace, remove and preview on any lesson in my school, so that I can fix a teacher's lesson.
8. As a student with an entitlement, I want the video to play without extra steps, so that I can learn.
9. As a student, I want playback to continue when my access grant is renewed, so that a long video is not interrupted.
10. As a student, I want my place in the lesson and checkpoint progress preserved across renewals, so that I am not sent back or paused unexpectedly.
11. As a student without an entitlement, I want to receive no video grant, so that paid content stays protected.
12. As a student, I want unpublished lessons to stay hidden, so that I never see drafts.
13. As a learner on an external-link lesson, I want it to play exactly as before, so that nothing regresses.
14. As the platform owner, I want hosted video off by default and enabled one school at a time, so that I can pilot safely.
15. As the platform owner, I want disabling a school to take effect on the next request, so that I can stop a problem quickly.
16. As the platform owner, I want a fixed cap per school on videos and total minutes, so that cost is bounded.
17. As the platform owner, I want a missed provider notification recovered automatically, so that a video does not stay stuck.
18. As the platform owner, I want an asset the provider deleted behind our back to stop issuing grants, so that students see an unavailable state instead of a broken player.
19. As the platform owner, I want a leaked or wrong video removable at the provider, so that a takedown cuts off existing grants within minutes.
20. As a developer, I want the database to refuse direct changes to a lesson's external link while a hosted video is current, so that the two sources cannot disagree.
21. As a developer, I want the video tables unreadable and unwritable from the browser, so that provider identifiers never leak.
22. As a developer, I want one small module with a fake provider, so that behavior is testable without the network.
23. As an operator, I want real receipts for webhook delivery through Cloudflare and real renewal on staging, so that "works" means observed, not mocked.

## Implementation Decisions

**Scope.** Foundation, upload, webhook to ready, signed playback, minimal teacher and student experience, staging operation. Deferred: captions, version history and restore, plan limits and usage, MCP and native, audited operator recovery API and inventory UI, durable queue machinery.

**Authorization.** Upload and removal: the lesson's owning teacher or a school admin, with fresh school membership checked in the lesson's own school. Playback: a student with an active entitlement to a published lesson in a published course, or an author or admin previewing (drafts included). The school comes only from the proxy-set school header (cookie sessions) or the verified token claim (Bearer); the default-school fallback is banned on these routes and the platform host is rejected.

**Data model (shared database, `lms` schema).**
- One lesson-media table: school, lesson, provider upload and asset identifiers, playback identifier, state (uploading, processing, ready, errored, deleting), duration, uploader, and a single current-video pointer per lesson. The uploader reference to the shared user table is set-null on delete because SayThanks shares that table.
- A service-only webhook ledger keyed by provider namespace `mux:lms:<environment-id>` plus the provider event ID.
- A service-only per-school settings row: enabled flag and the school cap.
- All three: all privileges revoked from anon and authenticated, reads included; the app reads and writes only through server routes with the service role after authorization.

**Source switching.** The external link field is untouched. A lesson plays hosted video only when a ready lesson-media row is current. A database trigger rejects changes to the external link while a hosted video is current. The existing version functions are not modified in the slice; restoring an old lesson version cannot change the hosted video (known gap, later phase).

**Lifecycle.**
- Replacement: the new row becomes current only when ready, in one transaction; the old row goes to deleting and is removed at the provider afterwards. Removal does the same without a new row.
- Webhooks: signature verified, applied inline as an idempotent upsert (see ADR 0002). Duplicate and out-of-order events are no-ops.
- Sweep (every minute, backstop): polls uploads past expiry plus margin, marks processing rows older than six hours errored (alert at 30 minutes), retries deletions, adopts a matching asset it finds, marks provider-deleted assets errored. Capacity is released only after the provider confirms deletion or absence. No manual operator action in the slice; a stuck row is resolved by a documented, logged manual database procedure.
- Cap: a fixed per-school count of non-deleted videos and total minutes, enforced when an upload is created; a pending upload counts at the 90-minute policy maximum until a real duration is known.

**Limits.** 2 GiB and 90 minutes per file; common video types validated by the provider; direct browser upload with a one-use URL restricted to the school's exact origin.

**Playback grants.** Minted by a rate-limited POST. Lifetime 600 seconds plus up to 30 seconds of jitter, so exposure after a revocation is about ten minutes; a decoded buffer and an old token can still play briefly. Takedown at the provider (delete the playback ID or rotate the signing key) is the lever. Only the audiences the player uses are minted. Tokens never appear in logs or error reports. Grants are provider-signed JWTs with the signing key held server-side.

**Player.** The checkpoint player resets only when the LMS media identity changes, never when a grant changes. A provider adapter swaps grants without emitting time, seek, ended or milestone events. Real seeking and initial resume still enforce unfinished markers.

**Module and routes.** One deep module (create upload, apply provider event, sweep, issue grant, remove) with the database client, provider client and clock injected; the provider SDK is imported in one adapter only. Thin routes: create upload, read state, remove, issue grant (all per lesson), webhook, sweep. DTOs expose state and a user-safe message only: no provider IDs, no upload URL after creation, no error internals to students.

**Switches and configuration.** A global environment flag and the per-school flag must both be on; the school flag is read fresh on each request, the global one needs a redeploy. Environment: provider API token ID and secret, webhook signing secret, playback signing key ID and private key, a dedicated sweep secret (constant-time compare, not the shared cron secret), none public. Separate provider environments for staging and production.

**Staging operation.** The webhook and sweep routes are exempt from the edge access policy. The sweep runs from a scheduled task whose HTTP client is verified in the runtime image. A manual driver calls the same sweep endpoint for harnesses.

## Testing Decisions

Good tests assert external behavior through the module's interface with a fake provider, or role-switched database tests; they do not assert implementation details.

1. **Database (role-switched):** anon and authenticated cannot read or write the three tables; a teacher's direct update of the external link on a lesson with a current hosted video is refused; deleting a user nulls the uploader; two current videos for one lesson are impossible.
2. **Upload:** non-owner teacher, student, cross-school request and platform host are refused; cap enforced with a pending upload at 90 minutes; flag off in either layer refuses.
3. **Webhook:** bad signature rejected; duplicate no-op; out-of-order ignored; ready and errored apply; unknown asset recorded, no effect.
4. **Replacement:** current pointer moves only when ready; old video removed afterwards.
5. **Sweep:** missed webhook recovered; expired upload and stuck processing row go errored; provider-deleted asset goes errored; capacity not released before confirmation; wrong sweep secret refused.
6. **Playback:** entitled student gets a grant, non-entitled none; unpublished refused for students, previews work; rate limit; token audience and lifetime; no token in logs or error reports.
7. **Player:** a grant swap fires no spurious marker, seek or milestone; reset keys on media identity only.
8. **Fallback:** external-link lessons play unchanged.
9. **Live gates on staging (receipts, not mocks):** a real provider webhook returns 2xx through the edge (record the edge request ID and the provider delivery log); real renewal at a short staging-only lifetime; decoded frames.

CI proves authorization and grant swap with a stubbed player; it does not prove real provider expiry or frames. Prior art: the repo's role-switched database tests, the Stripe webhook route tests, and the authenticated Playwright harness. The database test gate is wired into CI first, since no workflow runs it today.

## Out of Scope

Captions; version history, restore and snapshot changes; plan limits, usage metering and downgrade behavior; MCP, core and native clients; operator recovery API and inventory UI; durable queue, leases, fencing and reservations; custom-domain schools beyond what the strict resolver already supports; any production enablement (separate approval). Later phases follow the target-vision documents listed above.
