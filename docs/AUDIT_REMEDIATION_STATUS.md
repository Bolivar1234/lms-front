# LMS remediation status — 2026-10-22

The missing remediation work was reconstructed against
`cff63f962ea4ccd295efa81d7bc7912cfef597c3`. The earlier archive was unavailable;
the owner explicitly authorized reconstruction. Historical test counts in the
handoff are not results from this checkout. Existing changes were preserved;
no commit, push, merge, production migration, or deployment was performed.

## Fresh review update — Solana decommission

The requested product decision is now to remove Solana payments. This update
supersedes the historical Solana implementation and devnet claims below:

- Student and platform Solana API routes, the platform wallet checkout page,
  Solana cron schedules, wallet/settings UI, Phantom checkout controls, and
  Solana environment variables were removed. Legacy database enum values and
  historical migrations remain readable for data compatibility, but new
  Solana checkout requests return HTTP 410 and legacy checkout rows render a
  retired-payment notice.
- The provider registry and provider-selection surfaces no longer expose
  Solana. The public checkout route rejects old `solana` and `solana_subs`
  product/plan rows before creating a transaction.
- Account deletion now stops before Auth deletion when Storage cleanup fails;
  the caller can retry cleanup instead of leaving orphaned files behind.

Current verification for this update: focused unit tests passed (4 files,
67 tests before the route cleanup; 3 files, 55 tests after it), lint passed
with 0 errors and 71 existing warnings, and the real webpack production build
completed successfully with the configured 8 GB heap. The default sandboxed
Turbopack build could not bind its worker port; the first build also failed to
fetch Google Fonts under restricted networking. The escalated webpack build
fetched the declared fonts and completed. Full typecheck was attempted cold
and exhausted the available 8 GB heap; no typecheck pass is claimed for this
freshly changed tree.

## Changes

- Storage migrations remove the exact surviving broad policies; track private
  proof, certificate and exercise buckets; set size/MIME limits; reject public
  SVG uploads; and allow the existing mobile community media variants.
  Privileged uploads retain application authorization. Payment-proof upsert and
  both existing path prefixes remain compatible; signed-access failures are
  explicit. Existing public certificate paths remain compatible.
- All 16 audited media fields have upload controls. Lesson audio, vocabulary
  audio and downloadable files persist durable `lesson-resource://` references
  and resolve renewable authorized signed access instead of storing expiring
  links. Existing external URLs and audio aliases remain readable.
- Own-user avatars are editable in the shared student/teacher profile. Account
  deletion discovers privileged uploads by path and removes them through the
  Storage API before database deletion, using normal runtime settings.
- Page selectors, shared app/MCP URL mapping, template links, selected-block move
  controls, and delayed-upload cancellation/cleanup were reconstructed.
  Vocabulary round-trips preserve supported fields and multiline elements;
  audio source renewal preserves playing and paused positions.
- English browser URLs have no locale prefix. Internal `[locale]` files remain;
  locale presentation and URL producers changed without reopening the excluded
  routing-normalization investigation.
- Live application Solana modules and scripts use Kit-compatible helpers; root
  legacy SDK dependencies were removed. Initial subscription settlement is
  atomic through a service-role-only RPC with independent recovery. Plan 012
  remains open: Phase 5 is disabled by default and its explicit devnet-only
  opt-in is gated until real counter/timing behavior is established.
- Portable RuFlo helpers and exact 3.38.23 dependency pins were restored under
  `tools/ruflo`. Global authentication and trust were preserved.

The historical audit plus reconstruction map is in
[AUDIT_UPLOADS_LINKS_LOCALE.md](AUDIT_UPLOADS_LINKS_LOCALE.md); locale contract in
[LOCALE_REMOVAL_ANALYSIS.md](LOCALE_REMOVAL_ANALYSIS.md); Solana scope in
[plan 012](../plans/012-solana-kit-migration.md).

## Actual verification

Evidence root: `/workspace/scratch/lms-handoff-20261022/`. Commands run in the
repository unless another directory is stated. Local wrappers supply only
CLI-generated disposable Supabase credentials and synthetic provider settings;
private environment files are excluded from the archive.

| Check | Actual result | Receipt relative to evidence root |
| --- | --- | --- |
| `npm run build` through `run-local-app-env.py` | PASS, exit 0, 43.714 s; optimized production compilation, 244 static pages; real Google font fetching | `final-production-build-receipt.json`, `final-production-build.log` |
| `npm run test:unit -- --maxWorkers=2` | PASS, 291 files / 4,272 tests, no skips | `frontend-verification/final-cycle/app-unit-final.json` and `.log` |
| `npm run lint` | PASS, 0 errors / 72 warnings | `frontend-verification/final-cycle/app-lint.json` and `.log` |
| Exact `npm run typecheck`, full config / 8 GB | PASS cold 28.85 s and warm 4.51 s; fresh-cache isolation also passed 30.05 s | `frontend-verification/final-cycle/app-typecheck-cold.json`, `app-typecheck-warm.json` |
| MCP `npm ci`, `npm run typecheck`, `npm test`, `npm run build` | PASS, 20 files / 303 tests, no skips; aligned typecheck also passed | `mcp-package-verification.json`, `frontend-verification/final-cycle/mcp-typecheck-aligned.json` |
| Real local Storage API controls | PASS, 76/76; real Auth identities including anonymous/foreign-tenant denials | `storage-http-controls.json`, `storage-runtime-verification-summary.json` |
| Normal account-deletion API cleanup | PASS, 27/27, ordinary database settings, sentinel assets retained | `storage-account-http-cleanup.json` |
| New storage SQL suites | PASS, 2 suites, both exit 0 | `storage-sql-verification.json` |
| Supabase pgTAP | PASS, 7 files / 179 assertions | `baseline-db-verification.json`, `baseline-pgtap.log` |
| Ordinary rollback SQL | PASS, 17/17 after required seed-equivalent fixture setup; initial 16/17 failure retained | `baseline-db-verification.json`, `store-549-normalized-receipt.json` |
| Solana focused units | PASS, 18 files / 142 tests | `solana-unit-gated.log` |
| Initial settlement SQL / concurrency / rollback | PASS against local PostgreSQL | `solana-initial-sql-contract.log`, `solana-initial-concurrency.log` |
| Strict harness mainnet rejection | PASS without making a mainnet request | `solana-harness-mainnet-rejection.log` |
| RuFlo real stdio discovery and memory across restart | PASS, 333 tools discovered; store/retrieve/search executed after restart | `ruflo-project-verification.json` |
| Authenticated application uploads/private media/profiles | PASS, 7/7 Chromium cases, 0 skips/flaky, retries 0 | `browser-authenticated-uploads.receipt.json` |
| Broader changed-flow browser suite | 94 unique scenarios passed across initial 91/94 and corrected 13/13 rerun; 0 skips/flaky, retries 0 | `browser-broader-initial.receipt.json`, `browser-locale-navigation-rerun.receipt.json` |
| Puck upload/editor suite | PASS, 6/6, all ten upload fields; save/reopen and move/delayed-upload controls; 0 skips/flaky, retries 0 | `browser-puck-final.receipt.json` |
| Strict certificate issuance/storage browser case | PASS, 1/1, 8.315 s including cleanup; actual signed row, PDF/badge paths, bytes/content types and 400×400 badge | `browser-certificate-final.receipt.json` |

The production build follows the repository's existing separation of type
checking from Next build (`ignoreBuildErrors` already existed). A successful
build does not substitute for the standalone full-config compiler gate.

Initial compiler runs exhausted the 8 GB heap. Root and MCP React types were
aligned to the same 19.2.18 release, with no unrelated package-version changes.
A scratch path-alias diagnostic was not counted as a gate. The unchanged full
configuration then passed with a fresh incremental cache; the previous cache
was preserved. No source/generated exclusions, weakened types, permanent path
aliases, or heap increase were introduced. Exact standard `npm run typecheck`
then passed cold in 28.85 s and warm in 4.51 s. A final exact standard check
also passed in 4.87 s with both new specs included, then passed again after
the final test-helper/cleanup corrections (4.655 s;
`certificate-final-source-checks.json`). All runtime and test source is frozen.
Targeted lint also passed for the final browser test edits.

The initial full unit attempt had two stale old-prefix expectations plus one
sandbox `bash EPERM`; expectations were updated, and the final full suite ran
with the required local subprocess access. The baseline store SQL test expected
fixed UUIDs absent from fresh random-ID seed rows. Its unchanged assertions
passed under rollback-only seed-equivalent fixtures; exact before/after rows
and RPC definitions matched and no synthetic user remained.

## Browser and provider boundaries

Seven real production-app journeys passed against local GoTrue, PostgREST,
Storage and PostgreSQL. An actual teacher uploaded private audio/vocabulary/PDF
content; a real enrolled student played/downloaded it through application
authorization. Two distinct signed-source rotations preserved playing and paused
positions. The browser clock was advanced twice by 271 s, and cache-busting
queries forced distinct source URLs while retaining the real authorized signed
tokens and HTTP 200 Storage bytes. This verifies refresh calls and source-change
playback behavior; a wall-clock signed-token-expiration run was not performed.
Student and teacher avatar uploads survived reload; admin branding and
product-wizard thumbnails also passed. These are separate from service-role
Storage controls and isolated unit tests.

The broader run initially passed 91/94; two login-label regexes and one Base UI
boolean-attribute expectation failed. Corrected test-only assertions passed in
the full 13-case locale/navigation rerun; other selected cases already passed.
These reruns are not counted as additional unique scenarios. The initial Puck
run passed 3/5 and exposed a multipart metadata predicate timeout plus a test
drag that did not achieve its intended geometry. A subsequent 4/6 run exposed
a Chromium response-body protocol failure. Test-only helpers now forward real
requests and fulfill unchanged real server responses; uploads and Storage
assertions are not mocked. The final six-case Puck run passed in 30.074 s and
covered all ten image upload surfaces with database save/reopen, move controls
and delayed-upload lifecycle checks. Combined with the seven authenticated
cases, all sixteen audited upload fields were exercised through the app.
The initial strict certificate case passed signed PDF/badge assertions but
failed fixture cleanup: normal completion triggers had created rows whose
tenant foreign keys prevented early tenant deletion. Deleting exactly its own
two Auth fixtures before tenant cleanup resolved this without changing triggers
or protections. The final strict case passed in 8.315 s including cleanup.
There are **108 unique passing selected browser cases** (94 broader + 7 actual
role uploads/media/profiles + 6 Puck + 1 strict certificate), with no final skips
or flaky cases and retries set to zero. Initial failure receipts remain
preserved under distinct prefixes; no runtime changes were needed for the
browser harness corrections. `browser-aggregate-receipt.json` records all 108
unique cases and 133 executions including reruns; `browser-case-inventory.json`
lists the exact cases and final outcomes.
The complete repository E2E matrix was not run; coverage is the selected changed
flows above. No Firefox/Safari/mobile coverage is claimed. Core application checks use local
synthetic provider settings; no real Stripe, PayPal, model-provider, or MCP OAuth
integration was established. The strict certificate case uses an authenticated
admin after real student completion. A separate preexisting ordinary-student
issuer-key RLS restriction causes automatic full signing to fall back to a
row-only certificate; that unrelated baseline behavior was not changed or
reported as passing full student signing. The MCP package build passed; the Docker production
image/container smoke was not run under the disk constraint. Optional committed
store race and historical subscription-10002 SQL contracts were not run; missing
historical fixtures were not fabricated. LiteSVM was not run.

## Environment and local stack

- Hostname/container: `982ed6c406d7`; repository: `/workspace/lms-front`.
- Attached environment:
  `ccarenv_b64_Y2NhcmVudl83MzM0OWZlOWQxMmM4MTkxODg3ZjI4YTRjNGNlMWUxMg`.
  Configuration:
  `cb3c3cbe-d36f-4534-be77-feeab3707f7b~cecfg_6ada4bd8dbf0819b9fd8142bd4c2fdc1`.
  See `cloud-environment-status.json` for observed identity/state; a policy
  declaration alone did not establish connectivity.
- Node 24.19.0 / npm 11.9.0 match current CI. Initial immutable app `npm ci`
  installed 1,570 packages with unchanged manifests before reconstruction.
- `fonts.googleapis.com` and a real Noto Sans asset from `fonts.gstatic.com`
  returned HTTP 200. All eight existing font families/roles/variables remain;
  no fonts were mocked or substituted. The earlier two-host proposal was not
  applied. Both baseline and final normal production builds passed.
- Solana devnet `getVersion` returned `4.4.0-beta.1`; `getHealth` returned `ok`.
  See `environment-probe.json` and the program receipt below.
- Application public and service-role keys were present, but no Supabase URL,
  SQL connection or management access was configured. Values were not printed.
- Docker 28.4.0, `vfs`, was available. The official 48-layer PostgreSQL pull ran
  out of disk. A checksum-verified crane export of the exact official image
  was imported as one rootfs layer with its original image configuration;
  provenance is retained. No image push or Docker-driver change occurred.
- Disposable local Supabase uses CI-pinned CLI 2.115.0. PostgreSQL, GoTrue,
  PostgREST, Storage, Kong and Mailpit were retained; optional services were
  excluded. All 266 baseline migrations, three new migrations and the seed were
  applied. This establishes the core application stack, not optional Realtime
  or Edge Runtime coverage.
- BusyBox healthcheck requests followed the inherited proxy for local targets
  and falsely returned 403; CLI `--ignore-health-check` retained services, then
  actual Auth/Storage/API/browser probes and tests verified readiness. No RLS,
  session, entitlement, proxy trust, or TLS controls were disabled.
- Reviewed local process routing adds only `lvh.me,.lvh.me` to inherited
  NO_PROXY; Chromium pins those names to 127.0.0.1. Real GoTrue health returned
  HTTP 200 from both HTTP and Chromium probes. External proxies and CA trust
  were preserved. See `local-host-routing-probe.json`,
  `browser-local-auth-probe.log`, and `local-stack-provenance.txt`.
- Six disposable core containers remain running; no app/build/browser process
  remains. `final-local-container-state.txt` records actual service versions.
  Owned test tenant/user/page/asset residue checks passed. To reopen the built
  local app with the same guarded disposable settings, run
  `python3 /workspace/scratch/lms-handoff-20261022/run-local-app-env.py -- npm run start`.
  These private local connection files are not portable archive contents.

## Independent review and coordination

Native collaboration executed a `gpt-6-astra` ultra coordinator and
`gpt-6.1-sol` ultra implementation/testing/review agents, normally at most six
active including the root. Explicit owners and dependency ordering prevented
shared-file conflicts. RuFlo records persist coordination; they did not execute
those models. `tools/ruflo/audit-swarm.json` records actual task identities and
outcomes. Memory persisted across MCP restarts; mock embeddings may be active,
so semantic retrieval quality was not validated. Local registration does not
hot-load tools into this already-running chat.

A fresh pre-patch investigator assessed storage authorization and compatibility.
One fresh independent reviewer then reviewed an immutable 271-file source
snapshot, without investigator reports or test-result claims. Snapshot SHA-256:
`570d7091817e8372e05b3bf556b2e27998da656262598f048563421b12af85dc`.
The reviewer identified two P2 defects: vocabulary serialization lost fields,
and signed-audio rotation reset position. Both were independently confirmed,
corrected by the implementation owner, and regression-tested; actual browser
rotation checks also passed. See `independent-review-summary.json`. No second
independent review cycle is claimed.

## Production drift: not established

Read-only preflight responses in `production-readonly-preflight.json`:

| Documented candidate | Request | Actual response |
| --- | --- | --- |
| `tcqqnjfwmbfwcyhafbbt.supabase.co` | Auth settings with configured public key | HTTP 401, invalid API key |
| Same candidate | Public PostgREST OpenAPI | HTTP 401, invalid API key |
| `https://preciopana.com` | Public application GET | HTTP 403, Cloudflare 1010 |

These do not identify the keys' intended project or deployed image/commit.
Migration history, bucket visibility/limits, storage policies/grants, relevant
functions, and application version cannot be compared with production. No drift
or parity conclusion is claimed. The user does not have target/access details
and explicitly chose to leave production blocked. No further production
requests were made. The reviewable scoped query is
[production-readonly-catalog.sql](ruflo/production-readonly-catalog.sql).

An operator would need the intended Supabase URL, a scoped read-only catalog
export/connection, and deployed commit/image identity to finish this comparison.
Broad credentials or write access are not required. The two storage migrations
and initial-settlement migration are reviewable local changes only.

Automatic approval review rejected an additional public GET using a browser
user agent as outside the current authorized scope. It did not execute. The
user then chose to leave production blocked.

## Live devnet: blocked, plan 012 still open

`solana-program-preflight.json` verifies full devnet genesis
`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. At finalized slot 514006979,
program `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` exists and is
executable; SPL Token, associated-token, and system programs also exist.
Program presence and local settlement tests are not live transaction evidence.

Initial airdrop returned a JSON-RPC internal error; bounded 0.1/0.2/0.5 requests
returned HTTP 429. The harness reports blocked/nonzero instead of success after
skipping controls. Live split legs, tampering/partial failure, reconciliation,
subscription/recovery and period timing remain blocked. The one-hour renewal
timer never started. Phase 5 stays disabled by default; explicit devnet-only
opt-in does not establish its plan gate.

Generated public devnet payer:
`DtGAmM3sP2Szr5sRdWUeFnz9AE6aF3iaomowFbBepMKz`.
Approximately 0.1 free DEVNET SOL plus an actually executed transaction/timing
run is required. The user has no funding path; no further action is requested
from them now. Fixture keys stay outside Git and the review archive. No mainnet,
real funds, existing wallet private key, or live provider credentials were used.
See `solana-strict-devnet-initial.log`,
`solana-strict-devnet-funding-retries.log`,
`solana-airdrop-final-opportunity.log`, and
[the harness guide](verification/solana-kit-devnet-harness.md).

## Review deliverable and preserved exclusions

Final archive path:
`/workspace/scratch/lms-audit-reconstruction-review-20261022.tar.gz`.
It contains a base-commit/file-checksum manifest, tracked binary patch including
deletions, full changed/new source files and selected redacted evidence.
Dependencies, runtime databases/state, environment/key files, browser traces and
authenticated storage states are excluded. Reconcile against the manifest and
preserve newer changes; do not reset a target checkout or blindly overwrite it.
The archive manifest is authoritative for final source/docs/task metadata.
`verification-source-freeze-receipt.json` records the worker runtime/test freeze
before final root documentation and coordination updates; runtime/dependency
files did not change after the successful production build.

The separately blocked routing-normalization security follow-up remains
unresolved and excluded. Production writes/deploys, mainnet/real funds, skipped
provider integrations and live devnet gates are not represented as completed.
