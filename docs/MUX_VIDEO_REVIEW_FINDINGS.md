# Mux video hosting: findings and disposition ledger

Read the [master contracts](MUX_VIDEO_HOSTING_PLAN.md), [TDD acceptance families](MUX_VIDEO_TDD_PLAN.md), [operations receipts](MUX_VIDEO_OPS_RUNBOOK.md) and [pinned evidence](MUX_VIDEO_REFERENCES.md). The [file map](MUX_VIDEO_FILE_MAP.md) adds proposed physical paths and reference/owner coverage. This file tracks decisions and remaining implementation/launch work; it does not duplicate the normative route, limits or environment tables.

## Provenance and status meanings

The original Claude review covered plan commit `c221efbb` and spot-checked merged code at `d5db2bf477374d229aa6c049ffce08c7d7c4700e`. Its six read-only model passes were review, not runtime evidence. Codex's [ID-by-ID review of `dad21165`](https://github.com/Bolivar1234/lms-front/pull/26#issuecomment-6373777308) corrected facts; Claude's `0113d577f5de0f30fdb9ee476218cf324a1998af` preserved those corrections. PR #26 subsequently merged as `d4301200`, the application base of the five-document reconciliation. This revision reconciles all five documents, retaining IDs and the original restricted-code/reference boundaries.

Evidence identifiers C1–C14 refer to the exact code paths/commit in the [repository evidence index](MUX_VIDEO_REFERENCES.md#lms-repository-evidence-index). **Code-read** means static evidence at that baseline, not a live deployment test. **SDK-documented** means the published `@mux/ts` 15.6.1 sources. **Design** means a chosen application policy. **Live-unverified** means provider/target/account/operational evidence is still required.

Each ID below names its disposition, implementation status, evidence confidence/source and work-package owner, then links the authoritative decision and acceptance family. **Specified** closes a missing design contract only. **Open** implementation and **blocked/unverified** live gates remain open until an actual receipt passes. **Withdrawn** removes an inaccurate causal claim, not its useful deployment test. No application implementation, SQL/deployment/secret write or pilot enablement is claimed here.

## Finding dispositions and requirement-to-test mapping

### F-01

- **Disposition:** accepted, design specified; implementation **open**. **Owner/type:** WS2a / design blocker before ingest. **Evidence:** code-read C1/C2 (`d5db2bf`).
- **Decision:** [unleased immutable enqueue, due worker, leases/backoff and replay](MUX_VIDEO_HOSTING_PLAN.md#durable-webhooks-and-maintenance). The payment cron's attempt/age caps are not claim-RPC restrictions; provider retries are not the internal recovery budget.
- **Closure:** [T01](MUX_VIDEO_TDD_PLAN.md#t01), actual SQL/HTTP receipts plus live prompt-ack observation; duplicate delivery never overwrites the receipt.

### F-02

- **Disposition:** confirmed conditional risk, design specified; implementation **open**. **Owner/type:** WS2a / design blocker before shared-ledger ingest. **Evidence:** code-read C2 (`d5db2bf`).
- **Decision:** [payment namespace allowlist before order/LIMIT](MUX_VIDEO_HOSTING_PLAN.md#durable-webhooks-and-maintenance). Only sufficiently old, retry-eligible rows demonstrate the starvation condition. A separate Mux worker alone does not fix the payment query.
- **Closure:** [T02](MUX_VIDEO_TDD_PLAN.md#t02) with 25 older eligible Mux rows and a newer payment row; Mux receipts remain untouched by billing dispatch. No current production incident is asserted.

### F-03

- **Disposition:** app fix merged in [PR #27](https://github.com/Bolivar1234/lms-front/pull/27); merge `189eaf364ccb4c94cb9f9320835383824d9f5f22` confirmed; deployment/live check **unverified**, MCP validation **open**. **Owner/type:** baseline PR #27, WS3/WS6 and Ops / shared-mode gate. **Evidence:** C3 at `d5db2bf`; reviewed fix `7fd28b49fd3d9fc28a92234187793d6dc1cfbf97`, merged as `189eaf364ccb4c94cb9f9320835383824d9f5f22`.
- **Decision:** [independent validated app/MCP selectors](MUX_VIDEO_HOSTING_PLAN.md#database-and-deployment-namespaces). A static SDK assertion does not convert a runtime lms string; missing Bearer db options cause the baseline bug. Do not start a duplicate app fix.
- **Closure:** [T03](MUX_VIDEO_TDD_PLAN.md#t03), including actual shared Auth/RLS student/teacher/admin cookie/Bearer behavior and separate invalid MCP selector handling.

### F-04

- **Disposition:** credential-mode gap specified; implementation **open**, original exploit claim qualified. **Owner/type:** WS2b / new-route design contract. **Evidence:** code-read C3/C7; design, not a proven existing route exploit.
- **Decision:** [reject mixed credentials on new media mutations, explicit cookie Origin/Bearer paths](MUX_VIDEO_HOSTING_PLAN.md#authentication-access-and-trusted-origins). A raw Authorization header cannot suppress cookie checks; unauthenticated requests still fail.
- **Closure:** [T04](MUX_VIDEO_TDD_PLAN.md#t04), including malformed/missing/mixed credentials and sibling-school requests; no broad unrelated auth rewrite.

### F-05

- **Disposition:** accepted, design specified; implementation **open**. **Owner/type:** WS1 then WS6 / history integrity. **Evidence:** code-read C4 (`d5db2bf`).
- **Decision:** [versioned source marker and initial atomic hosted-restore guards](MUX_VIDEO_HOSTING_PLAN.md#data-model-integrity-and-history). Check current source and snapshot source, including legacy snapshots; future supported restoration increments generation.
- **Closure:** [T05](MUX_VIDEO_TDD_PLAN.md#t05); external-only restore remains functional and no unsupported clone shares provider ownership.

### F-06

- **Disposition:** fixture mechanism specified; implementation **open**, real renewal **live-unverified**. **Owner/type:** WS3/Ops / pilot gate. **Evidence:** design.
- **Decision:** [normal endpoint with server-only staging fixture TTL policy](MUX_VIDEO_HOSTING_PLAN.md#playback-renewal-and-history) and [controlled drill](MUX_VIDEO_OPS_RUNBOOK.md#pilot-controls-and-expiry-drill). No client TTL or deployed loopback seam; short-token lead avoids a renewal loop.
- **Closure:** [T06](MUX_VIDEO_TDD_PLAN.md#t06), production/nonfixture guards and actual decoded playback through expiry/background return, not prop assertions.

### F-07

- **Disposition:** remove-first pilot rule specified; implementation **open**. **Owner/type:** WS2b/WS4 / source integrity. **Evidence:** design.
- **Decision:** [ready/selected hosted media blocks a second pilot upload](MUX_VIDEO_HOSTING_PLAN.md#upload-ownership-recovery-and-state); stable conflict, no provider create/new daily attempt. Overlapping replacement is WS6.
- **Closure:** [T07](MUX_VIDEO_TDD_PLAN.md#t07) including concurrent start/restart/select/removal and generation races.

### F-08

- **Disposition:** verification action retained; account state **live-unverified**. **Owner/type:** Ops / pilot input. **Evidence:** SDK-documented test-asset limits; current allowance/pricing unverified.
- **Decision:** [verify actual account and fixture feasibility](MUX_VIDEO_OPS_RUNBOOK.md#mux-configuration-and-rotation). Short/watermarked/temporary test assets prove only applicable checks; no unconditional paid-plan purchase requirement.
- **Closure:** [T08](MUX_VIDEO_TDD_PLAN.md#t08) and named budget/allowance receipt, including actual basic-quality/signed/CORS compatibility.

### F-09

- **Disposition:** accepted, shared store specified; implementation **open**. **Owner/type:** WS2b/WS3 / pilot abuse control. **Evidence:** code-read C5; design budgets.
- **Decision:** [atomic fixed-window Postgres user/school counters](MUX_VIDEO_HOSTING_PLAN.md#canonical-limits-and-switches); outage denies 503, exhaustion 429. Upload/caption budgets remain separate.
- **Closure:** [T09](MUX_VIDEO_TDD_PLAN.md#t09), two instances, atomic dual-budget checks, windows and store failure.

### F-10

- **Disposition:** accepted; outdated bucket/policy facts corrected; implementation **open**, actual track delivery/source TTL **live-unverified**. **Owner/type:** WS1/WS4/Ops / pilot captions. **Evidence:** code-read C6; SDK-documented track events/createTrack.
- **Decision:** [dedicated private caption bucket, bounded UTF-8/VTT, unique track-attempt correlation and signed ingest](MUX_VIDEO_HOSTING_PLAN.md#captions-ux-and-privacy). Existing lesson-resources is **25 MiB** with restrictive policies and lacks VTT, not a policy-free 10 MB bucket.
- **Closure:** [T10](MUX_VIDEO_TDD_PLAN.md#t10), including permissive-policy isolation, raw/decoded and real proxy/ingress transport bounds, lost track-create response and signed CC; SDK event types are not live delivery proof.

### F-11

- **Disposition:** verified-identity operator policy specified; implementation **open**. **Owner/type:** WS4/Ops / pilot takedown. **Evidence:** code-read C7/C8; design.
- **Decision:** [API authentication before fresh super-admin membership](MUX_VIDEO_HOSTING_PLAN.md#captions-ux-and-privacy), platform Origin and durable reason/audit. Reuse the membership policy, not the page helper's caller-header shortcut. Human SQL/Mux operator is a different responsibility.
- **Closure:** [T11](MUX_VIDEO_TDD_PLAN.md#t11), forged/conflicting user headers, ordinary sessions, impersonation, audit survival and separately authorized disposable-key deletion.

### F-12

- **Disposition:** accepted, locking/idempotency/accounting specified; implementation **open**. **Owner/type:** WS2b / pilot cost integrity. **Evidence:** design, constrained by actual schema C13.
- **Decision:** [immutable actor/fingerprint and lock order](MUX_VIDEO_HOSTING_PLAN.md#data-model-integrity-and-history), [explicit UTC bounds and once-only capacity release](MUX_VIDEO_HOSTING_PLAN.md#canonical-limits-and-switches). Cancel does not refund daily new attempts; unknown provider outcomes retain reservations.
- **Closure:** [T12](MUX_VIDEO_TDD_PLAN.md#t12), cross-school concurrency, non-UTC midnight, changed declarations, actor deletion and cancel/ingest races.

### F-13

- **Disposition:** mandatory vulnerability/blocker claim withdrawn; new-route policy specified; implementation **open**. **Owner/type:** WS3 / response consistency. **Evidence:** design; C8 shows precedent, not proof of a vulnerability from 403 alone.
- **Decision:** [uniform 404 for inaccessible private media](MUX_VIDEO_HOSTING_PLAN.md#http-routes-and-dtos), distinct authentication/dependency failures. Existing resource/free-preview behavior is separately preserved.
- **Closure:** [T13](MUX_VIDEO_TDD_PLAN.md#t13), no tokens/IDs/status leak on denial and correct lookup ordering.

### F-14

- **Disposition:** mandatory-host-variable causal claim **withdrawn**; actual callback gate **live-unverified**. **Owner/type:** WS2a/Ops / deployment check. **Evidence:** code-read C7; actual helper check recorded in the review comment.
- **Decision:** [reserved circles and actual proxy callback test](MUX_VIDEO_HOSTING_PLAN.md#authentication-access-and-trusted-origins). Explicit platform hosts may still be configured; reserved labels already resolve non-tenant and API routes bypass page guards.
- **Closure:** [T14](MUX_VIDEO_TDD_PLAN.md#t14), real signed unauthenticated callback on verified host with flags off, no tenant/locale/auth redirect or ownership from caller headers.

### F-15

- **Disposition:** existing manual-caption pilot scope preserved; implementation **open**. **Owner/type:** WS4 / product capability. **Evidence:** consistent reviewed design plus source-read C14, not an outstanding owner choice.
- **Decision:** [manual WebVTT and school-specific publish policy](MUX_VIDEO_HOSTING_PLAN.md#captions-ux-and-privacy). SRT conversion, paste text, auto-captions and translation are deferred proposals, not new dependencies.
- **Closure:** [T15](MUX_VIDEO_TDD_PLAN.md#t15), teacher lifecycle, distinct states, en/es, accessibility, actual signed CC and source-aware transcript/question guards with a retained legacy URL/cache fixture.

### F-16

- **Disposition:** engineering controls specified; actual owners/policy/budget **blocked pending inputs**. **Owner/type:** WS4/Ops/product/privacy / pilot operations. **Evidence:** design; live behavior unverified.
- **Decision:** [named contacts/privacy/tracking/reporting](MUX_VIDEO_OPS_RUNBOOK.md#owners-and-target-record). Do not present a particular dashboard/CSP/legal obligation as universal; verify actual optional tracking off and applicable school requirements.
- **Closure:** [T16](MUX_VIDEO_TDD_PLAN.md#t16), owner approvals, real network/rollback/takedown evidence and honest product copy; no compliance-by-warning claim.

### F-17

- **Disposition:** accepted, shared gate specified; implementation **open**. **Owner/type:** WS3 / access correctness. **Evidence:** code-read C8 (`d5db2bf`).
- **Decision:** [fresh active membership before author/admin/entitlement branches](MUX_VIDEO_HOSTING_PLAN.md#authentication-access-and-trusted-origins). Exporting resource-specific canDownload alone is insufficient. Public resource previews stay separate.
- **Closure:** [T17](MUX_VIDEO_TDD_PLAN.md#t17), including inactive author and inactive entitled student through cookie/Bearer, forged ownership and DB failure.

### F-18

- **Disposition:** accepted, already planned; implementation **open**. **Owner/type:** WS2b/WS5 / pilot then wider economics. **Evidence:** code-read C9.
- **Decision:** [finite pilot settings and separate fail-closed media resolver](MUX_VIDEO_HOSTING_PLAN.md#canonical-limits-and-switches). Preserve generic non-media missing=unlimited behavior and restrict explicit unlimited media plans to approved eligibility.
- **Closure:** [T18](MUX_VIDEO_TDD_PLAN.md#t18); WS5 is not required to make finite pilot caps work.

### F-19

- **Disposition:** accepted, existing redaction described accurately; implementation **open**. **Owner/type:** WS2a / sensitive-data handling. **Evidence:** code-read C10/C8.
- **Decision:** [test actual uncovered forms and all output/persistence boundaries](MUX_VIDEO_HOSTING_PLAN.md#captions-ux-and-privacy). Existing Bearer/token-query masking does not prove bare JWT/upload/source URLs, console logs or receipt writes are sanitized.
- **Closure:** [T19](MUX_VIDEO_TDD_PLAN.md#t19), synthetic capability/PEM fixtures and useful nonsecret diagnostics retained.

### F-20

- **Disposition:** hardening accepted; authentication-bypass claim not asserted; implementation **open**. **Owner/type:** WS2b / maintenance control. **Evidence:** C2 already rejects missing secrets; design.
- **Decision:** [strict dedicated-secret maintenance contract](MUX_VIDEO_HOSTING_PLAN.md#environment-contract), constant-time helper and bounded work; no fallback to payment credentials.
- **Closure:** [T20](MUX_VIDEO_TDD_PLAN.md#t20), missing/malformed/wrong auth, budget deadline, empty versus failed tick and redaction.

### F-21

- **Disposition:** bounded recovery specified; implementation **open**, real race behavior **live-unverified**. **Owner/type:** WS2b/Ops / recovery integrity. **Evidence:** SDK-documented uploads pagination/optional URL; design.
- **Decision:** [owned intent, bounded discovery and unknown-not-absence](MUX_VIDEO_HOSTING_PLAN.md#upload-ownership-recovery-and-state). No blind create retry, adoption of foreign assets or optional-URL dependency.
- **Closure:** [T21](MUX_VIDEO_TDD_PLAN.md#t21), actual waiting cancel/ingest race, pagination exhaustion/lost handoff and honest File/restart UI.

### F-22

- **Disposition:** secret/receipt rotation specified; implementation **open**, provider drill **live-unverified**. **Owner/type:** WS2a/Ops / signature/replay integrity. **Evidence:** SDK-documented one-time secret and unique addresses.
- **Decision:** [distinct current/next callback URLs with common dedupe](MUX_VIDEO_OPS_RUNBOOK.md#mux-configuration-and-rotation); canonical minimal receipt, raw bounds, clock policy and separate signing-key rotation.
- **Closure:** [T22](MUX_VIDEO_TDD_PLAN.md#t22), dual-endpoint duplicate delivery, secret transition, environment/timestamp/body rejection and replay after deletion without resurrection.

### F-23

- **Disposition:** existing trusted-origin requirement made concrete; implementation **open**. **Owner/type:** WS2b / browser upload boundary. **Evidence:** code-read C11; provider matching live-unverified.
- **Decision:** [pure builder from verified tenant/config](MUX_VIDEO_HOSTING_PLAN.md#authentication-access-and-trusted-origins). Header-derived display URL helper is not authority; custom-domain infrastructure stays outside pilot.
- **Closure:** [T23](MUX_VIDEO_TDD_PLAN.md#t23), spoofed headers/body values and genuine browser CORS on intended origins.

### F-24

- **Disposition:** host-side scheduler choice preserved; registration/owner **blocked pending inputs**. **Owner/type:** Ops / operational gate. **Evidence:** C12 and existing master/runbook; actual host/version/provider defaults unverified.
- **Decision:** [one actual scheduler, dedicated secret, external heartbeat and manual replay](MUX_VIDEO_OPS_RUNBOOK.md#one-scheduler-and-observable-recovery). No assumption that curl exists or remembered Coolify health/timeout defaults hold.
- **Closure:** [T24](MUX_VIDEO_TDD_PLAN.md#t24), observed ticks and missed-run alert, no duplicate staging scheduler.

### F-25

- **Disposition:** actual SQL gate specified; implementation **open**, existing suite health unknown. **Owner/type:** WS0 / prerequisite. **Evidence:** code-read C12; seven discovered pgTAP files at baseline, no CI execution step.
- **Decision:** [disposable real SQL execution and runner/report failure checks](MUX_VIDEO_TDD_PLAN.md#test-placement-and-ci-gates). Inventory again at implementation; do not hide suite/setup failures by deleting required coverage.
- **Closure:** [T25](MUX_VIDEO_TDD_PLAN.md#t25), actual fresh reset/SQL CI report including empty/bad-plan/skipped-suite failure fixtures.

### F-26

- **Disposition:** local seam reuse/rejection specified; implementation **open**. **Owner/type:** WS2b / test isolation. **Evidence:** code-read C11.
- **Decision:** [canonical local-only MUX_API_BASE policy](MUX_VIDEO_HOSTING_PLAN.md#environment-contract), reusable loopback guard, explicit reject rather than warn/fallback, no deployed override or new CI switch.
- **Closure:** [T26](MUX_VIDEO_TDD_PLAN.md#t26), zero credential-bearing requests to deceptive/nonloopback targets and disabled builds without Mux secrets.

### F-27

- **Disposition:** mixed-reference type claim corrected; implementation **open**, shared catalog unverified. **Owner/type:** WS1/WS1b / schema gate. **Evidence:** code-read C13, canonical lessons PK bigint; some references/RPCs integer.
- **Decision:** [actual catalog/type verification, qualified functions and checked variants](MUX_VIDEO_HOSTING_PLAN.md#database-and-deployment-namespaces). No broad unrelated ID conversion or weakened compiler inputs.
- **Closure:** [T27](MUX_VIDEO_TDD_PLAN.md#t27), fresh public/shared catalogs, execute privileges and namespace drift tests.

### F-28

- **Disposition:** composite pointer/deletion design specified; implementation **open**, target version unverified. **Owner/type:** WS1 / database integrity. **Evidence:** design constrained by C13.
- **Decision:** [unique keys before FKs and media-before-selection](MUX_VIDEO_HOSTING_PLAN.md#data-model-integrity-and-history); verify column-specific SET NULL support. A fallback must cover actual cascades, not only app deletion.
- **Closure:** [T28](MUX_VIDEO_TDD_PLAN.md#t28), privileged wrong-owner pointer rejection, provider-global uniqueness, cascade cleanup and generation races.

### F-29

- **Disposition:** ordinary cascade behavior accepted, exceptional-path caveat retained; implementation **open**. **Owner/type:** WS1/WS2b / durable cleanup. **Evidence:** code-read C13; replica setting found in seed-prod, not proof normal deletion uses it.
- **Decision:** [transactional BEFORE DELETE outbox with no parent/auth FKs](MUX_VIDEO_HOSTING_PLAN.md#data-model-integrity-and-history). Seed/reset/trigger disabling is not an application teardown path.
- **Closure:** [T29](MUX_VIDEO_TDD_PLAN.md#t29), remove/cascades/uploader departure, once-only jobs, paused/failed deletion inventory and no late resurrection.

### F-30

- **Disposition:** service-only settings design preserved; implementation **open**. **Owner/type:** WS1 / enablement control. **Evidence:** code-read C13 and design; bank example has authenticated SELECT, not literally no grants.
- **Decision:** [dedicated settings with RLS, explicit browser/PUBLIC write revokes and safe capability DTO](MUX_VIDEO_HOSTING_PLAN.md#data-model-integrity-and-history). Column-only revoke cannot override table UPDATE.
- **Closure:** [T30](MUX_VIDEO_TDD_PLAN.md#t30), actual default/table grants and attempted school-admin self-enablement in public/shared fixtures.

## Documentation reconciliation checklist

| Original documentation request | Resolution |
| --- | --- |
| D01 fixed lms scope / verify identity | Master namespaces; runbook target record. No repeated scope question. |
| D02 route/DTO/status table | Master HTTP routes, success/error shapes and auth modes. |
| D03 environment names/defaults/owners | Master environment table; canonical signing/maintenance/fixture names. |
| D04 lifecycle vocabulary | Master media transition table; caption/player/API outcome distinctions; no undefined quarantine state. |
| D05 named tables/actors/operator | Master data model, immutable request actor, opaque attribution reference, API-verified operator identity. |
| D06 consistent packages | TDD WS/PR alias/dependency table, distinguished from actual GitHub PR numbers. |
| D07 quantitative gates | Master engineering limits; runbook requires actual budget/owner thresholds. Under-two-second target and five-second provider deadline are compatible. |
| D08 token examples | Master worked pilot and later maximum TTLs, margin and short-fixture renewal lead. |
| D09 one canonical policy source | Master owns limits/flags/routes/env; TDD tests, ops receipts, ledger status link there. |
| D10 deferred workflow instructions | References explicitly label later AI/workflow/search scope while preserving every requested pinned source. |
| D11 traceability/filenames/receipt | Every F-ID maps to T-ID above; TDD ordered migration names and gate/discovery contracts; runbook receipt template. |
| D12 actual scheduler target | Host-side choice fixed; actual service/host/version/owner and observed registration remain explicit launch inputs, not invented facts. |

## UX copy and scheduling notes

WS4 translates these proposed key states into actual en/es keys and parity tests; player control localization and actual rendering remain tested implementation work. No processing-time measurement or hard provider upload-byte guarantee is promised.

| State | English | Spanish |
| --- | --- | --- |
| Source | Upload a video or paste a link | Sube un video o pega un enlace |
| Guidance | MP4 or MOV; up to 2 GiB declared size and 90 minutes. | MP4 o MOV; tamaño declarado de hasta 2 GiB y 90 minutos. |
| Uploading | Uploading… keep this tab open. | Subiendo… mantén esta pestaña abierta. |
| Preparing | Preparing your video. You can leave this page. | Preparando tu video. Puedes salir de esta página. |
| Ready | Your video is ready. You can add captions. | Tu video está listo. Puedes agregar subtítulos. |
| File lost | Upload interrupted. Choose the file again to restart. | La subida se interrumpió. Elige el archivo de nuevo para reiniciar. |
| Captions absent | This video has no captions yet. | Este video aún no tiene subtítulos. |
| Hosting off | Video upload is not enabled for your school. Paste an external link or contact support. | La subida de video no está activada para tu escuela. Pega un enlace externo o contacta a soporte. |
| Cap hit | Your school has used its pilot video allowance. Remove a video or contact support. | Tu escuela ha usado su cupo de video del piloto. Elimina un video o contacta a soporte. |
| Retrying | Connection problem, retrying… | Problema de conexión, reintentando… |
| Access ended | Your access to this course has ended. | Tu acceso a este curso ha terminado. |
| Updated | This video was updated. Reload to watch the new version. | Este video se actualizó. Recarga para ver la nueva versión. |
| Unavailable | This video cannot play right now. Try again or report a problem. | Este video no se puede reproducir ahora. Inténtalo de nuevo o informa del problema. |

Caption warnings do not bypass stricter school/course requirements; display Video/Captions separately, accessible CC controls and explicit failed-ingest recovery. Resume is local to user+media/browser, not cross-device or cross-version. No viewer analytics are implied by this copy; operational metrics need the privacy baseline.

The original review's 34–52 engineer-day estimate is historical and unmeasured, not a deadline commitment. Re-estimate after WS0 health, actual provider contracts and package ownership are known; critical dependencies are in the TDD table. Proposals to defer captions or uncertain-upload safety were not adopted. Test coverage and measured CI runtime drive scheduling, not an arbitrary browser-spec cap.

## Remaining inputs and evidence

See the runbook's [target record](MUX_VIDEO_OPS_RUNBOOK.md#owners-and-target-record) and [rollout receipt](MUX_VIDEO_OPS_RUNBOOK.md#rollout-receipt) for the actual database operator/baseline/role, verified staging project/service, Mux account allowance/credentials, fixture/pilot school, scheduler host, budget/abuse/privacy contacts and scoped authorizations. These are **blocked/unverified until supplied and observed**; missing access does not undo the documented engineering decisions.

No further scope decision is needed for lms mode, manual captions, remove-first uploads, private-media status policy, fixture expiry mechanism, shared limiter, scheduler strategy or separate production approval. An explicit later owner change updates master/TDD/ops/ledger together. No implementation or live finding is marked resolved solely by this documentation revision.
