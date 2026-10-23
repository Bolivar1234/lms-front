# Mux hosting reference appendix


Read with [the master plan](MUX_VIDEO_HOSTING_PLAN.md), [TDD work packages](MUX_VIDEO_TDD_PLAN.md), and [the ops runbook](MUX_VIDEO_OPS_RUNBOOK.md). These are references, not extra pilot requirements.

## Source verification and reuse rules

All 50 unique nested source-file links below were verified against their exact commit objects in the corresponding checkouts during this review. This proves the paths exist at those commits; it does not prove their code is secure or compatible with current SDKs. The upstream links and pinned commits requested by the user remain intact.

Current implementation SDK: `@mux/ts` 15.6.1 was observed in npm during this review. `@mux/mux-node` 15.5.0 carries an explicit deprecation notice directing users to `@mux/ts`. Historical examples below legitimately use the old import; adapt them, do not install that deprecated name for new work. See the [SDK repository](https://github.com/muxinc/mux-ts), [migration guide](https://github.com/muxinc/mux-ts/blob/main/MIGRATION.md), and [current npm package](https://www.npmjs.com/package/@mux/ts).

| Source | Verified license evidence / permitted role |
| --- | --- |
| SayThanks | Internal narrow Mux modules; README distinguishes Makerkit starter licensing from SayThanks changes. Check ownership/terms for any copied file; no app transplant. |
| Uvacha | README declares MIT; no standalone license file observed. Attribution and dependency checks still apply. |
| Whop Udemy clone | Project README declares MIT and warns that production hardening is incomplete. |
| Simply Learn | MIT LICENSE and README declaration. |
| Sonny external-video course example | README declares MIT and points to LICENSE.md. |
| Sonny Mux example | CC BY-NC 4.0; design reference only for this commercial application. |
| Official Mux/Vercel workflow example | No root LICENSE or README license declaration observed at the pinned commit; architecture reference until reuse rights are established. |

Code from a restricted or unclear license is excluded from the implementation copy list. Its cited architectural observations remain for traceability, as the user requested. No need to remove the evidence merely because code reuse is restricted.

## Verified provider contracts

- [Create upload](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload): signed playback policy, expiry, CORS, metadata limits, encoding settings.
- [Retrieve upload](https://www.mux.com/docs/api-reference/video/direct-uploads/get-direct-upload): response URL is not guaranteed; SDK Upload.url is optional. Do not base retry correctness on it.
- [Webhooks](https://www.mux.com/docs/guides/listen-for-webhooks): five-second attempt timeout and retries for up to 24 hours. Published SDK verifySignature uses a 300-second tolerance.
- [Signed playback](https://www.mux.com/docs/guides/secure-video-playback): expiry can interrupt an active stream; mid-stream renewal remains a live acceptance gate.
- [Signing keys API](https://www.mux.com/docs/api-reference/system/signing-keys): deletion invalidates signatures. There is no separate key-revoke operation to call.
- The published `@mux/ts` 15.6.1 types confirm that createTrack requires a ready asset and accepts text track URL, language, name, text_type, and closed_captions. Use the actual API/SDK shape when implementing manual captions.


Agents must inspect the pinned sources below before implementing a corresponding LMS module. These references are design and behavior inputs, not permission to copy an entire application. Every implementation must be reconciled with the current LMS auth, tenant, RLS, route, and lesson-resource contracts.

### SayThanks: primary internal reference

Repository: [`Bolivar1234/saythanks`](https://github.com/Bolivar1234/saythanks), commit [`b1e47709dea869be60fc234a43e26c689e430d16`](https://github.com/Bolivar1234/saythanks/tree/b1e47709dea869be60fc234a43e26c689e430d16).

Use these files and symbols as the main production reference:

- [`apps/web/app/api/saythanks/_lib/server/mux-client.ts`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/app/api/saythanks/_lib/server/mux-client.ts): `getMuxClient`, `isMuxApiConfigured`, `isMuxSigningConfigured`, `createSignedMuxPlayback`, PEM normalization, timeout/retry settings, and short token TTL.
- [`apps/web/app/api/webhooks/mux/route.ts`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/app/api/webhooks/mux/route.ts): raw-body signature verification, event deduplication, service-role webhook handling, asset-ready/error transitions, and idempotent reconciliation.
- [`apps/web/app/api/saythanks/_lib/server/collection-form-media.ts`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/app/api/saythanks/_lib/server/collection-form-media.ts): reserve-before-upload ordering, exact CORS origin selection, direct upload creation, rollback, and provider-aware status handling.
- [`apps/web/app/api/saythanks/_lib/server/mux-upload-provenance.ts`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/app/api/saythanks/_lib/server/mux-upload-provenance.ts): `passthrough` ownership binding, reconciliation, foreign-provenance rejection, and orphan cleanup.
- [`apps/web/app/api/saythanks/media/[mediaId]/playback/route.ts`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/app/api/saythanks/media/%5BmediaId%5D/playback/route.ts): access checks before signing, ready-state requirements, JSON/redirect playback responses, and no-store behavior.
- [`apps/web/components/saythanks/video-player.tsx`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/components/saythanks/video-player.tsx): dynamic Mux Player loading, loading/error states, signed poster use, and provider fallback behavior.
- [`apps/web/supabase/migrations/20260512000000_mux_provider_support.sql`](https://github.com/Bolivar1234/saythanks/blob/b1e47709dea869be60fc234a43e26c689e430d16/apps/web/supabase/migrations/20260512000000_mux_provider_support.sql): provider fields, lifecycle states, and database constraints to compare with LMS `lesson_media`.

Adapt the narrow Mux modules and their tests. Do not copy SayThanks authentication, routing, app shell, public-form/captcha flow, or unrelated product semantics.

### Uvacha: direct-upload and handoff reference

Repository: [`bhaktasn/Uvacha`](https://github.com/bhaktasn/Uvacha), commit [`8f7e7ed990428a94dea33513fa55278ecb362516`](https://github.com/bhaktasn/Uvacha/tree/8f7e7ed990428a94dea33513fa55278ecb362516).

Use these files for the browser handoff and compact metadata ideas:

- [`lib/mux/client.ts`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/lib/mux/client.ts): minimal server-side Mux client factory.
- [`app/api/videos/upload-session/route.ts`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/app/api/videos/upload-session/route.ts): direct upload session shape, metadata validation, and compact `passthrough` because Mux limits its length.
- [`app/api/videos/finalize/route.ts`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/app/api/videos/finalize/route.ts): client-visible `waiting`/`preparing`/`ready`/`errored` polling states and idempotent completion behavior.
- [`lib/upload-metadata.ts`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/lib/upload-metadata.ts): HMAC upload-ticket binding, expiry, owner matching, and timing-safe signature comparison.
- [`components/VideoWatchPlayer.tsx`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/components/VideoWatchPlayer.tsx) and [`lib/mux/thumbnails.ts`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/lib/mux/thumbnails.ts): basic Mux Player and thumbnail behavior.
- [`scripts/test-upload-flow.mjs`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/scripts/test-upload-flow.mjs): a useful test shape for processing states, retry/idempotency, ticket tampering, and expiry.
- [`DATABASE_SETUP.md`](https://github.com/bhaktasn/Uvacha/blob/8f7e7ed990428a94dea33513fa55278ecb362516/DATABASE_SETUP.md): simple video metadata, release-window, and owner RLS examples.

Do not copy Uvacha's public playback policy, client-only finalize-as-source-of-truth design, single-profile authorization, wildcard CORS fallback, or lack of durable orphan cleanup. The pinned README explicitly declares MIT; no standalone LICENSE file was found in that checkout. Preserve attribution and check the actual reused files/dependencies; the earlier claim that there was no license declaration was incorrect.

### Whop Courstar Udemy clone: closest course-platform reference

Repository: [`whopio/whop-tutorials/udemy-clone`](https://github.com/whopio/whop-tutorials/tree/main/udemy-clone), commit [`778256d5fba3ffa65da34a6f516ad1dcc06ac1e0`](https://github.com/whopio/whop-tutorials/tree/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone). The project declares MIT licensing in its README, but also describes itself as educational and explicitly warns that production hardening is incomplete.

This is the closest reference for LMS course and lesson behavior. Agents should inspect:

- [`prisma/schema.prisma`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/prisma/schema.prisma): `Course`, `Section`, `Lesson`, `Enrollment`, `Progress`, `Review`, and `WebhookEvent`; especially the lesson fields `muxAssetId`, `muxPlaybackId`, `muxUploadId`, `duration`, and `videoReady`.
- [`src/app/api/teach/upload/route.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/api/teach/upload/route.ts): instructor ownership check, replacement upload, exact `NEXT_PUBLIC_APP_URL` CORS origin, signed playback policy, and direct upload URL creation.
- [`src/app/api/webhooks/mux/route.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/api/webhooks/mux/route.ts): raw-body Mux signature verification, `video.upload.asset_created`, `video.asset.ready`, passthrough lesson correlation, and event idempotency.
- [`src/app/api/playback/[playbackId]/route.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/api/playback/%5BplaybackId%5D/route.ts): free-lesson and enrollment checks before signing playback tokens.
- [`src/components/course-editor.tsx`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/components/course-editor.tsx): inline section/lesson editing, direct XHR progress, processing/ready labels, and publish gating on ready lessons.
- [`src/components/video-player.tsx`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/components/video-player.tsx): client-side token fetch, Mux Player token wiring, and auto-complete on video end.
- [`src/app/courses/[slug]/learn/[lessonId]/page.tsx`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/courses/%5Bslug%5D/learn/%5BlessonId%5D/page.tsx): course access gate, free-lesson handling, lesson navigation, progress display, and player placement.
- [`src/app/api/teach/lessons/route.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/api/teach/lessons/route.ts) and [`src/app/api/teach/courses/[courseId]/route.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/api/teach/courses/%5BcourseId%5D/route.ts): owner checks and synchronous Mux asset deletion on lesson/course deletion.
- [`src/app/api/teach/courses/[courseId]/publish/route.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/app/api/teach/courses/%5BcourseId%5D/publish/route.ts): requiring at least one section with a ready video before publishing.
- [`src/lib/mux.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/lib/mux.ts) and [`src/lib/env.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/src/lib/env.ts): Mux client construction, signing key environment names, and runtime validation.
- [`prisma/seed.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/prisma/seed.ts) and [`prisma/upload-seed-videos.ts`](https://github.com/whopio/whop-tutorials/blob/778256d5fba3ffa65da34a6f516ad1dcc06ac1e0/udemy-clone/prisma/upload-seed-videos.ts): disposable real-Mux seed uploads and polling for development smoke tests only.

Adapt these product behaviors to LMS as follows:

| Courstar reference | LMS implementation |
| --- | --- |
| `Lesson` Mux columns | Private `lesson_media` provider row plus the `lesson_video_source` side pointer |
| `CreatorProfile` ownership | Existing LMS course-author and tenant-admin authorization |
| `Enrollment` lookup | Existing entitlement/course-access service and RLS |
| `videoReady` boolean | Durable media lifecycle (`uploading`, `preparing`, `ready`, `errored`, cleanup states) |
| `WebhookEvent` Prisma row | Existing LMS webhook-event ledger plus idempotent media transition |
| `/api/playback/[playbackId]` | Lesson/media route that checks access before signing; never authorize by provider ID alone |
| Inline course editor | Existing LMS lesson editor with upload, processing, retry, replace, and remove states |

Do not import its gaps: it deletes the old asset before the replacement is ready, has no durable initial media row, uses a fixed four-hour playback token without this plan's duration/renewal/session policy, authorizes by raw playback ID, records the webhook event before the side effect without safe retry recovery, has in-memory rate limiting, lacks declared-file safeguards, and performs synchronous cleanup that can fail during course deletion. Its direct upload and lesson-editor shape are useful; its production security model is not.

### Sonny Sangha Mux example: UI and provider concepts only

Repository: [`lms-platform-ai-saas-sanity-clerk-coderabbit-mux-openai-ai-agent-nextjs-16`](https://github.com/sonnysangha/lms-platform-ai-saas-sanity-clerk-coderabbit-mux-openai-ai-agent-nextjs-16), commit [`db612064fa0f1724c486e574ed2ac2ce54d2f11e`](https://github.com/sonnysangha/lms-platform-ai-saas-sanity-clerk-coderabbit-mux-openai-ai-agent-nextjs-16/tree/db612064fa0f1724c486e574ed2ac2ce54d2f11e).

Inspect [`components/admin/inputs/MuxVideoInput.tsx`](https://github.com/sonnysangha/lms-platform-ai-saas-sanity-clerk-coderabbit-mux-openai-ai-agent-nextjs-16/blob/db612064fa0f1724c486e574ed2ac2ce54d2f11e/components/admin/inputs/MuxVideoInput.tsx), [`lib/actions/mux.ts`](https://github.com/sonnysangha/lms-platform-ai-saas-sanity-clerk-coderabbit-mux-openai-ai-agent-nextjs-16/blob/db612064fa0f1724c486e574ed2ac2ce54d2f11e/lib/actions/mux.ts), and [`components/lessons/MuxVideoPlayer.tsx`](https://github.com/sonnysangha/lms-platform-ai-saas-sanity-clerk-coderabbit-mux-openai-ai-agent-nextjs-16/blob/db612064fa0f1724c486e574ed2ac2ce54d2f11e/components/lessons/MuxVideoPlayer.tsx) for upload UI states, polling, signed playback, and player configuration.

This repository is licensed CC BY-NC 4.0. Do not copy its code into a commercial LMS. Its upload authorization, wildcard CORS, polling-only lifecycle, and playback authorization are insufficient for LMS; use the concepts only.

### Sonny Sangha course-platform example: external-provider fallback only

Repository: [`lms-course-platform-saas-nextjs15-sanity-stripe-clerk-shadcn-typescript`](https://github.com/sonnysangha/lms-course-platform-saas-nextjs15-sanity-stripe-clerk-shadcn-typescript), commit [`ca7f8f355c4bd379a335a37e7ad1290b4e29afdc`](https://github.com/sonnysangha/lms-course-platform-saas-nextjs15-sanity-stripe-clerk-shadcn-typescript/tree/ca7f8f355c4bd379a335a37e7ad1290b4e29afdc).

Inspect [`components/VideoPlayer.tsx`](https://github.com/sonnysangha/lms-course-platform-saas-nextjs15-sanity-stripe-clerk-shadcn-typescript/blob/ca7f8f355c4bd379a335a37e7ad1290b4e29afdc/components/VideoPlayer.tsx), [`components/LoomEmbed.tsx`](https://github.com/sonnysangha/lms-course-platform-saas-nextjs15-sanity-stripe-clerk-shadcn-typescript/blob/ca7f8f355c4bd379a335a37e7ad1290b4e29afdc/components/LoomEmbed.tsx), and its lesson URL/provider fields for external-player fallback behavior. This repository does not provide the Mux upload, webhook, or authorization implementation needed by LMS.

### Simply Learn: secondary UI reference

Repository: [`ARYPROGRAMMER/Simply-Learn`](https://github.com/ARYPROGRAMMER/Simply-Learn), commit [`ca7b6a6e80f4ef180b7fb72ec6784cb90777703f`](https://github.com/ARYPROGRAMMER/Simply-Learn/tree/ca7b6a6e80f4ef180b7fb72ec6784cb90777703f).

Inspect [`components/teacher/MuxUpload.tsx`](https://github.com/ARYPROGRAMMER/Simply-Learn/blob/ca7b6a6e80f4ef180b7fb72ec6784cb90777703f/components/teacher/MuxUpload.tsx) for browser file validation, drag-and-drop progress, retries, and processing state presentation. It is MIT-licensed, but its Xano endpoints, public playback policy, and weak role/enrollment checks must not be imported into LMS.

## Official provider references

Agents must read the current official documentation before changing the provider integration. The Supabase mirror documentation is reference material only for this release; it is not an instruction to add the package or Edge Function.

- [Mux direct uploads](https://www.mux.com/docs/api-reference/video/direct-uploads): upload creation, upload URL handling, expiration, and browser handoff.
- [Mux webhooks](https://www.mux.com/docs/guides/listen-for-webhooks): raw event verification, event types, retries, and asset/track lifecycle behavior.
- [Mux securing video playback](https://www.mux.com/docs/guides/secure-video-playback): signed playback policy, JWT claims, token expiry, and key rotation.
- [Mux pricing](https://www.mux.com/pricing): verify current storage, delivery, and encoding costs before publishing quota numbers; do not copy prices from a review or memory.

- [Mux + Supabase integration guide](https://www.mux.com/docs/integrations/supabase): useful provider-mirror concepts, but the `@mux/supabase` schema, migrations, and Edge Function are deferred until a separately isolated provider project exists.
- [Supabase Mux partner listing](https://supabase.com/partners/catalog/mux): confirms the supported `@mux/supabase` package and its assets, uploads, live-streams, and webhook-event mirror.
- [Mux + Supabase announcement](https://www.mux.com/blog/introducing-mux-supabase-because-every-app-needs-a-database): explains why provider metadata belongs in the `mux` schema while application ownership and permissions remain in the LMS schema.
- [Semantic video search example](https://www.mux.com/blog/building-semantic-video-search-with-mux-and-supabase): reference for generated captions, `video.asset.track.ready`, timestamped transcripts, `pgvector`, and future transcript chunks; it is phase two/three, not an MVP blocker.
- [`@mux/supabase`](https://www.npmjs.com/package/@mux/supabase) and [`@mux/sync-engine`](https://www.npmjs.com/package/@mux/sync-engine): record as a future option only; do not install them for the first LMS release.

When an implementation choice differs from one of these references, record the reason in the PR and preserve the LMS-specific security boundary.

### Official Mux/Vercel workflow reference: muxinc/nextjs-video-ai-workflows

Repository: [muxinc/nextjs-video-ai-workflows](https://github.com/muxinc/nextjs-video-ai-workflows), inspected at commit [ef90b23df7daef585d44335aa87f7b6d2b8b2035](https://github.com/muxinc/nextjs-video-ai-workflows/tree/ef90b23df7daef585d44335aa87f7b6d2b8b2035). This is the official Mux/Vercel reference for durable video-AI orchestration. It is useful for the post-upload enrichment layer, but it is not an LMS upload, entitlement, or tenant-authorization implementation.

The pinned checkout has no root LICENSE file. Treat it as a cited architecture reference until the repository owner confirms reuse rights; do not copy the repository wholesale. Any code reuse must be checked against the upstream license status at the time of implementation and recorded in the PR.

Agents implementing captions, summaries, translations, or semantic search must inspect these exact files and symbols:

- [AGENTS.md](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/AGENTS.md) and [README.md](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/README.md): the three-layer model (primitives, durable workflows, connectors), environment contract, and the distinction between server-side durable execution and browser-local progress rehydration.
- [app/lib/env.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/app/lib/env.ts): Zod startup validation for Mux credentials, optional signing keys, AI providers, and workflow-specific storage. LMS should keep its existing validated environment module and add only the Mux variables it actually uses.
- [app/lib/mux.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/app/lib/mux.ts): the singleton mux client, listAssets, getAsset, getPlaybackIdForAsset, getReadyAudioTracks, findAudioTrack, getReadyTextTracks, findTextTrack, and generatePlaybackToken. Adopt the centralized server client and track helpers; change playback selection so LMS always uses the authorized private playback ID and the token lifetime/renewal contract defined by this plan.
- [workflows/get-summary-and-tags.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/workflows/get-summary-and-tags.ts): use workflow placement, separate use step functions, getWritable progress events, and explicit success/error results.
- [workflows/translate-captions.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/workflows/translate-captions.ts): a durable wrapper around translateCaptions, including non-blocking execution and a final upload-confirmation step. For LMS, persist the returned track association against the tenant-owned lesson_media row and let the Mux webhook remain the final readiness signal.
- [workflows/translate-audio.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/workflows/translate-audio.ts): the bounded exponential poll for a newly-created Mux audio track to reach ready. Keep this pattern if dubbing is enabled later; do not add ElevenLabs as an MVP dependency.
- [workflows/workflow-progress.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/workflows/workflow-progress.ts): safe stream writes, close handling, and bounded sleeps.
- [app/api/workflows/translate-captions/route.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/app/api/workflows/translate-captions/route.ts) and [app/api/workflows/translate-audio/route.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/app/api/workflows/translate-audio/route.ts): start() returns a run ID immediately; getRun() exposes explicit running, completed, and failed states. LMS routes must authenticate the caller and bind the run to the tenant/media record before starting or polling it.
- [app/lib/workflow-state.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/app/lib/workflow-state.ts): browser-local run keys and rehydration. Use this only as UI convenience; the authoritative LMS workflow state belongs in the database and must be visible across devices.
- [db/schema.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/db/schema.ts): the demo's videos, video_chunks, and vector(1536) shape. Use it only as a phase-three pgvector reference. Do not transplant its Drizzle tables into Supabase or omit LMS tenant/course/entitlement keys.
- [db/search.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/db/search.ts): timestamped transcript chunk search with cosine similarity and rate limiting. Before exposing this in LMS, add tenant/course/enrollment predicates and return a playback token only after the lesson access check; the demo's Mux catalog lookup can return public playback IDs and has no LMS authorization boundary.
- [scripts/import-mux-assets.ts](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/scripts/import-mux-assets.ts): a catalog backfill that fetches ready assets, reads a selected VTT track, and calls generateVideoEmbeddings. It is not a webhook processor, upload flow, or authorization model. LMS ingestion must be driven by owned lesson_media rows and idempotent video.asset.track.ready/asset lifecycle events.
- [context/implementation-explained.md](https://github.com/muxinc/nextjs-video-ai-workflows/blob/ef90b23df7daef585d44335aa87f7b6d2b8b2035/context/implementation-explained.md): the rationale for using direct primitives for short work, Vercel Workflows for retryable work over roughly ten seconds, and connectors for multi-tool rendering.

Adopt these patterns only in later authorized media-intelligence work; teacher-uploaded captions in the pilot do not require AI workflows:

1. Keep upload creation, webhook reconciliation, entitlement checks, and playback signing in LMS-owned server modules. After a media row reaches ready, optionally enqueue a summary/caption workflow with start() and persist its run ID and step state.
2. Use use workflow only in orchestration functions and use step in each side-effecting step. Make every step idempotent: a retry must safely upsert the same transcript, track association, or embedding version.
3. Return a run ID from the start route and expose status through an authenticated route. The UI may rehydrate that ID from local storage, but database state and server-side workflow status are authoritative.
4. Add transcript chunks and embeddings only after the upload and caption lifecycle is stable. Every search query must scope by tenant, course, and lesson visibility before similarity ranking; never let a raw Mux asset ID grant access.

Deliberately reject these demo assumptions for LMS:

- public playback preference and the one-day signed-token default in app/lib/mux.ts; LMS uses private playback and the duration-aware token lifetime and renewal contract defined by this plan;
- the standalone Drizzle/Postgres catalog, unscoped videos/video_chunks tables, and direct Mux lookup from search results;
- S3 translation artifacts, Remotion/Lambda rendering, and ElevenLabs dubbing in the first release;
- importing all Mux assets as the source of truth; LMS lesson_media ownership is the only first-release application record and no provider mirror is required;
- claiming cross-device durability from localStorage, which is browser-local only.

The master plan and TDD work packages govern release scope: APIs plus a harness are internal only; a teacher pilot also requires editor upload, manual captions, finite pilot caps, cleanup, abuse controls, the shared-schema gate, and live staging acceptance. Add @mux/ai and Vercel Workflows in a later, separately reviewable phase for captions, summaries, translation, and semantic search.
