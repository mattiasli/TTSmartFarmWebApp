# Implementation progress

Do not write secrets, broker passwords, OAuth client secrets, session tokens, or database URLs into this file.

## Current handoff (2026-09-22)

**Production read-only is deployed: https://smartfarm-live.vercel.app**, revision
1c6eb418fd26e33f1cf556890a0ad0cc76bc2fa1. CI 35700323331, staging release
35701046216 and production release 35701555060 all passed. Evidence:
`releases/production-1c6eb41.json`. Live API 71875f4a-2e91-4990-9e9a-ce1efeb3e3be
reports healthy ownership, live mode and both command flags false.
Fresh OAuth at 07:42 UTC verified the original production cookie attributes;
authenticated browser verification at 07:56 received seven live WSS snapshots,
all 22 fields, rendered the editor, verified no-store and disabled controls,
and observed zero page errors. Evidence: `releases/production-oauth-2026-09-22.json`
and `releases/production-authenticated-2026-09-22.json`.

The dashboard now uses the authenticated session's farm ID for HTTP requests and
WSS tickets. Previously the hardcoded simulator ID forced production onto HTTP
polling and misdirected history/membership reads. Two regression tests and all
nine browser tests passed. Production cookies use __Host-smartfarm_session;
the early observer's staging-cookie-name assumption was a helper bug, now fixed.
Sessions last 12 hours. Staging release 35700595946 stopped at preflight after
overnight expiry, before deployment. Both app sessions were refreshed in one
browser, and the encrypted STAGING_SESSION_COOKIE secret was replaced before retry.
Saved app sessions are `.infra/staging-auth.json` and `.infra/production-auth.json`.
Do not ask for more sign-ins while valid; use `.infra/check-production-oauth.mjs --reuse`.

The first three-minute hosted sensor observation recorded 197/197 fresh HTTP
snapshots, all 22 fields and one controller epoch. It included transient DHT
failure sentinels (-99/-1), light 3434–3509 and distance 17–43 cm. Transport
freshness does not prove physical sensor response. The user reported completing
light cover/uncover and near/far distance steps during a second observation.
No clear light-cover response or intended 10/30-cm distance correlation was
established in that recording. On September 22 the user subsequently confirmed
that rain/steam, distance and light sensors work correctly. Record these as
operator-confirmed checks without rewriting the earlier measured evidence.
The user also confirms that displayed temperature and humidity look reasonable;
the transient DHT failure readings remain recorded separately.
The user subsequently confirmed motion, yellow button and soil/tank readings.
Basic sensor checks are now operator-confirmed, alongside the recorded several
minutes of fresh telemetry. Command-retention audit at 08:29–08:30 UTC found no
retained or live commands across firmware filters; 37 fresh telemetry packets,
zero publish calls and zero messages cleared. Evidence:
`releases/command-retention-2026-09-22.json`. The new audit tool's actual local
broker test verifies canonical/nested/legacy retained-topic detection and that
retained messages remain unchanged. Run `node tools/scripts/audit-live-command-retention.mjs`
for a fresh bounded audit before cutover.

First supervised actuator test passed at 08:41 UTC: the operator confirmed
readiness, power interruption access, other controllers stopped and reuse of the
existing credential. Temporary command enablement on the same source SHA allowed
exactly two fan requests (on, then off 2.002 seconds later). Both reached
`state_matched`; the operator confirms the physical fan ran and stopped.
Commands were restored disabled at 08:42:10 UTC; pump enablement remained false.
Evidence: `releases/production-fan-2026-09-22.json`. The restored dashboard passed
an authenticated browser check with seven live WSS snapshots, all 22 fields,
disabled controls and zero page errors (`releases/production-after-fan-2026-09-22.json`).
This reused the valid app session, not a new OAuth sign-in. Local cleanup tests
cover ambiguous enable/on errors, failed off/observation and restoration failures:
`npm run test:unit -- tools/scripts/supervised-fan-window.test.mjs` (7 passed).
The next separately authorized group passed at 08:56 UTC: LED/backlight,
one short beep, feeder open/close and two 16-character LCD lines/status. The user
confirms all five worked; power is USB plus another supply (ratings unknown).
Seven state-reported commands reached `state_matched`; beep and LCD text/status
remain `sent/not_reported`, with operator confirmation rather than fictitious
device acknowledgements. All ten requests and telemetry observations are in
`releases/production-outputs-2026-09-22.json`. Commands were restored false at
08:57:15 UTC, pump flag stayed false, and all outputs returned to their baseline.
Five invalid LCD payloads were rejected with HTTP 400 VALIDATION while read-only.
The restored browser passed with six live WSS snapshots, all 22 fields, disabled
controls and no page errors (`releases/production-after-outputs-2026-09-22.json`).
Nine cleanup/schema/scope tests passed for `supervised-output-sequence.test.mjs`.
Fan evidence commit 0233e96 passed CI 35706695286 and staging release 35706982599.
Production source remains 1c6eb41.
Cooling/manual takeover/Pause/browser All off passed at 09:16 UTC with operator
confirmation. The fan held both on and off inside a 22-26 degree hysteresis band
at 24 degrees C. Pause preserved manual fan ownership and released automatic
ownership; browser All off stopped the active fan and LED. The test browser was
closed for 10.234 seconds without test polling: master stayed enabled and fan on,
but no independent rule transition was observed during that closed interval.
Settings were restored, automations paused and commands disabled at 09:17:26 UTC.
Evidence: `releases/production-cooling-2026-09-22.json` and
`releases/production-after-cooling-2026-09-22.json` (seven live WSS snapshots,
all 22 fields, disabled controls, no page errors). Pump flag stayed false.
The device's existing guard thresholds are 8/10; app settings are 20/30. Neither
was changed. A conservative initial preflight stopped before enablement; code
review and an actual-engine regression verified that cooling with irrigation off
and unchanged guard settings emits only fan commands. This mismatch remains
unresolved for pump qualification.

That investigation found a UI status bug: runtime.guardConfirmed used only the
firmware support bit, allowing unmatched thresholds to display as confirmed.
It now uses the existing guardStatus check, which requires matched settings and
no pending/failed synchronization. The regression covers mismatched/partially
matched thresholds, absent telemetry, pending settings and confirmation.
31 targeted tests passed. This correction is prepared for CI and deployment;
production still runs the previously qualified source listed above.
Output commit c95cb20 passed CI 35708048925 and staging release 35708360634.
Next: supervised lighting/motion, low-tank alarm, beep UI and an independent
automatic state change during browser closure. No further actuator commands
are authorized by the completed cooling group.
G09/G10 remain open; backup/restore remains explicitly deferred. The shared MQTT
credential exception covers initial read-only use and these supervised non-pump tests.

## Earlier release notes

Update 18:07 UTC: 03e0edf passed CI 35634180123 and staging release 35634568197.
Production deployment tokens passed preflight in first live release 35635193382.
Its API deployment 07ecd466-11ad-49a8-8c1b-473cde2a15e6 failed during startup:
pre-deploy `run-migrate.ts` seeded the default local farm, then the configured
live farm collided on controller_lock_key=1. No host/remote deployed or commands
sent. Migration/seed entry points now use the configured farm ID/name/environment,
matching API startup; an actual PostgreSQL migration-to-startup regression passes.
The successful retry followed CI/staging qualification and transactional removal
of the unused default seed: one local farm and its untouched defaults/membership/
allowlist plus its single automation.config revision-1 event. Inspection verified
no commands, telemetry, sessions, OAuth flows or WS tickets. All three migrations
were preserved. Repair used private Railway SSH; temporary key was revoked and
local key files removed. No public database port was opened.

**Verified coordinated release: 28c8cde67e89f1ef944fa296dec78d4500a3762b.**
CI 35630085572 and release workflow 35630437207 both succeeded. All six release
stages passed: preflight/previous mapping, API, immutable remote, host build,
candidate browser, promotion/stable browser. Evidence: `releases/staging-28c8cde.json`.
That artifact exposed a rollback-metadata bug: its previous API ID is the failed
7a94d608 attempt, not the running 79f128b deployment 476637bc-c083-4bdd-91a1-13d99b706281.
The original artifact is retained. The runner now selects the single successful
active deployment, with a regression test for a newer failed attempt. Do not use
the failed ID as a rollback target. The earlier 79f128b qualification is retained.
S14 coordinated deployment is demonstrated. Fresh WebKit OAuth at 16:49 UTC
captured the original 302 cookie attributes (Secure, HttpOnly, SameSite=Lax,
host-only, Path=/), editor, snapshot/no-store and three WSS snapshots. No cookies
were imported or saved. Evidence: `releases/staging-webkit-observed-oauth-2026-09-21.json`.
The local HTTPS observer preserved the original response and verified upstream
TLS; the disposable browser trusted its test certificate, while provider HTTPS
was tunneled opaquely. The Windows driver's SameSite=None report is not the
server response. No additional user sign-in is needed for S02.

G08 is qualified for the agreed scope after review of S01–S14. S12 backup/restore
remains explicitly deferred, never passed. P14 has actual read-only broker evidence;
hosted live deployment now passed; supervised non-pump acceptance remains. G09/G10 are open.

Subsequent release 35627854052 for documentation/tooling revision 3e431b6 failed
at the API stage (Railway deployment 7a94d608-9f9c-42f3-b708-ec6dd185397f).
The image built and migration logs reported success, but the deployment failed
before a new API became active; provider diagnosis was null. Do not infer the
cause from that alone. The prior API stayed healthy; no remote/host promotion
occurred. A local container migration exited normally, and the subsequent 28c8cde
release passed without a speculative migration change.

P14 implementation now selects a live TLS MQTT adapter, with verified
certificate/hostname, credential validation, successful-SUBACK requirement,
disconnect freshness reset and read-only publish rejection. The prior factory
always selected simulator transport; live-mode policy flags alone were not a
physical connection. Five focused tests and all 143 unit tests passed on 28c8cde,
with lint/types and three actual local MQTT integration tests. The user requested
reuse of the existing device credential for the initial read-only connection;
this is an explicit dedicated-principal exception, not a broker publish denial.
The three-minute local observation received 223 valid samples, all 22 fields,
one MQTT epoch, max observed gap 1173 ms and no publish calls. Evidence:
`releases/live-readonly-2026-09-21.json`. The user confirms the latest source in
the sibling `FanMqtt` folder is installed and other desktop/Android apps are stopped.
This is operator-reported firmware identity, not a binary readback. Physical sensor
stimuli and hosted live telemetry remain unverified.
All three actual local MQTT integration tests pass after disabling automatic
resubscription so readiness always waits for the explicit subscription's SUBACK.

Production projects, separate Postgres/API services and verified Vercel domains
are provisioned; IDs are in `tools/deploy/production.json`. API runtime variables
are configured with APP_ENV=production, FARM_MODE=live and both command flags false.
The user added separate production GitHub OAuth credentials; presence confirmed.
The live API is deployed. The manual read-only production workflow requires
exact CI and successful staging release, and leaves OAuth/live-browser/hardware
qualification explicitly pending after initial public login deployment.
All four production secrets were validated by the successful live release.
PRODUCTION_READONLY_RELEASE_ENABLED=true. The deployed permission fix ensures
HTTP and WebSocket
snapshots preserve disabled control permissions even for operators, the header
shows Read-only, and live automation starts/resumes and guard sync reject commands.
Nine browser tests passed, including the operator WebSocket permission regression.
See `PRODUCTION_DEPLOYMENT.md` for exact URLs.

All five staging environment secrets are configured and provider access is verified.
`STAGING_RELEASE_ENABLED=true`; Railway has no Git deployment trigger, both
Vercel configs disable native Git deployment, and API IaC omits a Git source.
Vercel may create canceled/inactive Git records; these do not publish a release.
Use VERCEL_ORG_ID/VERCEL_PROJECT_ID for CLI deployment: --scope requires a user
profile that these tokens cannot read (404). Promotion uses the project API
directly for the same reason, then polls the stable host deployment ID.

The 88ccd03 candidate refusal was reproduced with master automations running.
Railway recorded POST /automations/start at 16:18:45 UTC, after the release paused
them. The user did not remember using the control. No background restart was
demonstrated. After an explicit pause, that candidate passed; 79f128b then passed
the whole release. Do not weaken the paused-state assertion.

79f128b also fixes the reported header jump: rounded age values, bounded units,
fixed-width tabular numerals. Hosted Chromium and WebKit at 630px retained exact
navigation geometry across live updates. Evidence: `releases/staging-header-2026-09-21.json`.

`releases/staging.json` is a recorded release, not an automatically updated live
pointer. For subsequent releases download the successful workflow's manifest and
set STAGING_RELEASE_MANIFEST for the public/authenticated smoke scripts. Never
qualify the old immutable remote as if it were the current host's pin.

The following entries are historical and superseded where they describe missing
credentials, inactive deployment authority or outstanding S14 work.

### Release activation preparation (September 21, after f4d8aff)

All five GitHub staging environment secret names are now present. Native Railway
Git source disconnection succeeded; both Vercel app configs now disable native
Git deployments and API IaC no longer declares a Git source. The running f4d8aff
release passed all CI/provider deployments and public plus authenticated
Chromium/WebKit smokes. The new activation revision must pass CI before enabling
and dispatching smartfarm-web-staging. Secret presence is not yet proof of token
validity. Coordinated release qualification remains pending.

### Coordinated release implementation (2026-09-21 15:17 UTC)

Added the disabled smartfarm-web-staging workflow, exact-source/CI policy checks,
ordered API/remote/host runner and pre-promotion browser checks. Three release
policy tests, lint and typecheck pass. Hosted candidate verification passed against
the existing 893a491 host with the immutable 9abcf36 remote: nine public remote
assets, contract v1, missing chunk 404, editor, two WSS snapshots, history,
no-store and paused/off simulator state. This is evidence for the candidate
verifier, not an end-to-end coordinated release. Simulator automations were paused.

Encrypted host automation-bypass and staging app-session secrets are now in the
GitHub smartfarm-staging environment. Railway project-token creation was denied;
Vercel deployment-token creation failed without a confirmed provider cause.
Deployment credentials and native-hook cutover remain outstanding. Workflow
activation is disabled and native hooks are still connected. See RELEASE.md for
the concrete credential and activation steps. No backup/restore was performed.

### Follow-up: IaC applied and fresh WebKit OAuth verified (14:50 UTC)

Release `94b8e5af4ed1e6a3a5a5821f183ab9994f868c84` passed all CI and provider
deployments (run 35613578059). Fresh WebKit 26.6 GitHub OAuth as mattiasli then
passed editor rendering, authenticated snapshot/no-store and WSS; no cookies were
imported. Evidence: `releases/staging-webkit-oauth-2026-09-21.json`. Secure and
HttpOnly were observed, but redirect Set-Cookie was omitted and SameSite reported
None by Windows WebKit. S02 cookie qualification remains explicitly unresolved;
the user completed the requested login and need not repeat it without a concrete
new verification method.

Railway API IaC is now authored at `.railway/railway.ts`, using SDK 3.11.0 and CLI
5.58.0, and was applied successfully. Its partial owns only default-service.
Database and volume are excluded; secrets remain preserve() references. Direct
readback confirms one replica, sleep false, ON_FAILURE, readiness and drain;
deployment 320d58e1-6a26-4b55-9066-3a4b3919a2fd succeeded and its build log confirms
Dockerfile use. The graph reads DOCKERFILE but ServiceInstance reports RAILPACK;
the plan also repeatedly omits default restart/sleep values. These provider
reporting discrepancies are recorded, not treated as proof of drift or a reason
for repeated applies. Evidence: `releases/staging-iac-2026-09-21.json`.
The legacy TOML has been replaced. Typecheck includes IaC. Remaining S14 work is
the actual coordinated GitHub Actions staging release workflow and credentials.
Do not equate independent successful provider checks with ordered deployment.

Verified release `966a6d18b09a22047da13d71a7fe6f7b40b83527` passed CI run
35612537569 (135 unit, 32 PostgreSQL integration, federation and browser checks)
and all three provider deployments. Mapping: `releases/staging-966a6d1.json`.
The host retains the verified immutable 9abcf36 remote.

S08 hosted database outage passed: actual Postgres restart, API process survived,
command rejected with HTTP 500, ownership loss observed, settings retained,
paused/off recovery in 2.97 seconds and automatic browser WSS recovery.
The local real TCP-outage test directly asserts no publishing after ownership
loss and covers an interrupted background runtime write. Evidence:
`releases/staging-database-outage-2026-09-21.json`. No backup/restore occurred.

Post-drill public assets and authenticated Chromium/WebKit editor, snapshots,
no-store and WSS checks passed; zero page errors. These reuse an app session,
so fresh WebKit OAuth/SameSite qualification remains outstanding (S02).
Browser evidence: `releases/staging-966a6d1-browser.json`.

S13 database size/retention evidence is complete as described below. Remaining
G08 work: S02 fresh WebKit OAuth/SameSite and S14 coordinated release/IaC.
Section 16.4 requires **API, then immutable remote, then host**; earlier notes
referring to remote/API/host ordering were imprecise. Native independent CI gates
are verified but do not supply this ordering. Railway `config migrate` dry-run
omits drain/predeploy settings and emits the folder name as project; do not apply
that generated file blindly. No IaC/provider settings changed in that dry-run.
S12 backup/restore remains an explicit user scope exception, including local
logical restore. Later gates require production access and supervised hardware.

## Database maintenance implementation (2026-09-21)

**Verified staging release:** `b3ae50288e9f68a49c9ba7612a514a3f4e6083a3`.
CI run 35611197988 and all provider deployments passed. Hosted admin metrics
confirm migration 003, 25,590 telemetry rows, 192 events and 176 commands with
table/index sizes in `releases/staging-database-size-2026-09-21.json`. Scheduled
auth cleanup removed 9 OAuth flows, 109 tickets and revoked one expired session.
Retention completed without errors; all hosted history is younger than its
retention cutoff, so zero history deletions is expected. Populated deletion
behavior is covered by the real PostgreSQL integration fixture below.

S08 preparation reproduced three uncaught idle-pool disconnect exceptions during
an actual TCP outage affecting all database connections. Pool errors are now
handled without logging credential-bearing error objects; interrupted background
controller writes pause control and trigger ownership recovery. The new real
PostgreSQL outage test verifies HTTP readiness, unavailable commands, no publishes,
settings/revision retention and paused recovery, including an in-flight write.
It and both controller lock tests pass; all 135 unit tests, typecheck and lint
pass. This outage fix still needs deployment and the hosted S08 drill.

The first outage-fix candidate `d7c8d67` was held by CI run 35611966639:
its outage test passed, but event-pagination integration failed. Investigation
confirmed PostgreSQL microseconds were truncated by JavaScript Date in the cursor,
skipping events within one millisecond. Cursors now preserve the exact database
timestamp. A deterministic three-event microsecond fixture and all 14 repository
tests pass, with typecheck/lint. The controlled hosted observer is prepared at
`tools/scripts/observe-staging-database-outage.mjs <deployed-sha>`; wait for its
ready message before restarting only the staging Postgres service.

Backup/restore remains explicitly deferred, including logical dump/local restore.
The evidence-only release `6e6df4113d01c85ef9421eb5c883bd6e64364167` passed
CI run 35609030418 and all three provider deployments.

S13 investigation found retention and expired-auth cleanup methods were never
scheduled. The API now runs bounded cleanup on a separate, time-limited database
pool: auth every minute, retention at startup and daily. Migration 003 adds
retention indexes and permits expired commands to be deleted across batch
boundaries while retaining newer optional references as null. An admin-only,
no-store diagnostics endpoint reports farm row counts, relation/index sizes,
migrations and maintenance results without private row contents.

Validation: 135 unit tests passed; PostgreSQL maintenance tests passed with 1,005
expired rows per retained table, newer linked records, scheduled cleanup and
anonymous/viewer/admin permissions. Full integration run had only a stale
migration-list assertion failure; after updating it, all 14 repository tests
passed. Typecheck and lint passed. Hosted migration/metrics verification passed.
Use `node tools/scripts/inspect-staging-database.mjs` after deployment.

## Previous verified handoff (2026-09-21 13:56 UTC)

Latest verified runtime is `05cc832d62deac0e0ea88ac3faaec10bb973d422`.
All CI jobs passed in run 35607375925. **S10 hosted handover passed:** new API
reported HTTP-ready/waiting_for_owner while the old deployment remained active;
old SIGTERM-to-shutdown log interval was 363 ms; new owner followed shutdown.
Browser observer confirmed a new epoch, settings/revision retention, paused/off
state and automatic WSS recovery. Evidence: `releases/staging-overlap-logs-2026-09-21.json`
and `releases/staging-handover-2026-09-21.json`.

**S11 supported rollback and restoration passed:** API and host returned to the
immediately previous a94f688 pair with the same immutable 9abcf36 remote. Exact
baked SHA survived rollback. Public assets and authenticated Chromium/WebKit
rendering/snapshots/WSS passed. The latest 05cc832 pair was then restored and all
these checks passed again. Every transition retained settings, paused automations
and off outputs. Current Railway restored deployment:
`49895789-ccfb-4354-8367-3bff89845efc`; host `4sNdetXxZCp9sreExDc8viMi4MTa`.
See `releases/staging-05cc832.json` and the rollback/restore evidence files.
Browser checks reused app sessions; fresh OAuth/SameSite qualification remains S02.

CI gates now have before/after provider evidence in
`releases/staging-ci-hold-2026-09-21.json`: host build READY without its stable
alias while the required check ran, then successful exact GitHub job references
and stable aliases; Railway WAITING then build/deploy after CI. Independent gates
still do not order remote/API/host deployment, so S14 remains incomplete.

Remaining G08 work: S02 WebKit OAuth/SameSite qualification, S08 hosted DB outage,
S13 DB size/retention, S14 ordered release and IaC. S12 backup/restore is explicitly
deferred. Later gates still require production access and supervised hardware evidence.

### Previous baseline and preparation

Verified `a94f6883e5ac8e5c3cc200cab1ed1a3605967728`: all CI passed, all three
deployments succeeded, API owner reports its exact baked source revision, public
immutable remote assets passed, and authenticated Chromium/WebKit rendering,
snapshots and WSS passed. Mapping: `releases/staging-a94f688.json`; browser evidence:
`releases/staging-a94f688-browser.json`. Keep this pair as the immediately previous
release for the next rollback; older images lose Git SHA metadata on Railway rollback.

Railway deployment `8435236e-ab40-4c5d-a326-9747d8b616e7` was observed WAITING
while the old API stayed SUCCESS, then deployed after successful CI. Both Vercel
check runs succeeded and reference GitHub job 106355466711. Complete alias-hold
timing and remote/API/host ordering remain unqualified. The next small API change
logs initial/readiness ownership transitions, allowing the hosted overlap drill to
show HTTP readiness while waiting for the old owner. Existing SIGTERM logs cover
drain completion. No application configuration secrets are logged.

S03, S05, S06, S07, S09 and calibrated latency/stale checks have evidence below.
Remaining: S02 WebKit OAuth/SameSite qualification, S08 hosted DB outage, S10 hosted
overlap, S11 full supported rollback pair, S13 DB size/retention, S14 ordering/IaC.
S12 backup/restore is explicitly deferred by the user, including local logical restore.

## Hosted manual-command failure and fix (2026-09-21)

**Latest verified application release:** `d3b6c445e2fb82ea7483d289402bbb6e5fb684a7`,
all CI jobs passed in run 35604666400. Hosted calibrated latency/stale checks passed:
154 samples, upper latency p95 419 ms/max 515 ms, stale indication at 4.22 seconds,
disabled starts, API 422 STALE_TELEMETRY, accepted pump stop, automatic telemetry
recovery with automations paused. Evidence: `releases/staging-latency-2026-09-21.json`.

The subsequent rollback drill failed qualification. Railway restored the requested
image and became owner but reported SHA `dev`: runtime Git-trigger variables do
not survive image rollback. The Dockerfile now retains the build SHA in RELEASE_SHA
and an OCI revision label; deploy and test that fix before another drill. The
original d3b6c44 API image was restored (provider deployment
`e2ed897c-881a-458f-b877-ce9436a78332`), still with the same missing-metadata defect.
Vercel rejected the older ad1706e host rollback with 402 because this plan permits
only the immediately previous production deployment. Its host alias stayed on
d3b6c44. Keep the next rollback pair immediately adjacent and record both before
switching. Failure: `releases/staging-rollback-before-metadata-fix-2026-09-21.json`.

Provider CI gates are now saved and independently read back: Vercel host and remote
require GitHub `smartfarm-required` before production alias assignment; Railway's
exact staging GitHub trigger has checkSuites=true (Wait for CI). Evidence:
`releases/staging-ci-gates-2026-09-21.json`. Observe these gates on the next release;
full remote/API/host ordering and IaC remain incomplete. Backup/restore stays deferred.

The next S13 hosted run exposed a dashboard defect: the stale banner appeared but
the Fan switch stayed enabled. The UI gated commands only on role, although the
server rejects stale non-stop commands. The fix gates non-stop controls, host Start
and remote resume on freshness and controller/broker readiness, preserving stop
attempts. The browser now ages last-known telemetry using its monotonic clock even
when updates cease. Browser regressions cover actual simulator telemetry stalling
and browser network loss. Hosted failure evidence is preserved in
`releases/staging-stale-before-ui-fix-2026-09-21.json`; rerun S13 after deployment.

The fix is deployed as `f7d36d926f50f075b7d3c8a2ee718e025157f5c9`.
All required CI jobs passed in run 35602322118, and all three provider deployments
succeeded. Hosted S03 subsequently passed: manual command observations, all five
automation sequences, guard synchronization, and irrigation on/off after browser
closure with ten seconds without API polling. Original settings were restored and
cleanup left the simulator normal, paused and off. The 34 command requests had
p95 acceptance latency 599 ms and maximum 711 ms. Evidence:
`releases/staging-automations-2026-09-21.json`.

The earlier latency observer has no remaining process handle and produced no
evidence file. It cannot qualify S13; a fresh calibrated observation is required.

Release `5e2ab4e69ae5d457c594353cc27400a6e88f2b3a` deployed successfully to all
three services and passed all CI jobs (including the additional review job):
https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35601603610

The expanded hosted automation harness stopped during manual backlight changes:
HTTP 422 `ACTUATOR_BUSY`. Backlight was incorrectly classified as sent-only even
though `bl` telemetry reports it; sent-only LCD/beep commands also remained pending
forever and blocked subsequent commands. Failed evidence is preserved in
`releases/staging-automations-before-command-fix-2026-09-21.json`. Harness cleanup
restored normal sensor conditions, original settings, synchronized guard and All off.

The fix uses state matching for backlight and treats sent/not_reported commands as
finished for actuator locking and pending UI, while preserving their honest `sent`
status. Disconnect/restart no longer turns already-sent unreported commands into
uncertain work; accepted-but-not-sent commands still become uncertain without replay.
All 133 unit tests and the PostgreSQL restart regression passed. Full hosted S03
and calibrated latency/stale checks must be rerun after deploying this fix.

## Backup facility limitation and measurements (2026-09-21)

Hosted S05 passed on `ad1706e` with distinct GitHub identities `mattiasli` and
`xueshanmattiasli`. The untouched editor followed saves, dirty drafts survived
conflicts, reload accepted saved settings, an overtaken request returned 409
without overwriting, and the operator could save successfully. Cleanup restored
the original settings and removed temporary operator access. Evidence:
`releases/staging-concurrency-2026-09-21.json`.

S09's local MQTT audit found that the old test title claimed offline/no-queue
coverage without actually disconnecting the broker. A new integration test now
shuts down the actual loopback broker with clients connected, rejects offline
actuation, restarts on the same port, observes a new MQTT epoch and fresh telemetry,
checks no queued actuation and paused automations, then explicitly resumes and
observes a new command. This exposed a deadlock in the test broker's shutdown:
TCP server close waited for clients before MQTT broker close disconnected them.
Both shutdown operations now start together. All three local MQTT tests passed;
sanitized JUnit-derived evidence and source hashes are in
`releases/staging-local-mqtt-2026-09-21.json`. The hosted memory transport's browser
interruption/recovery evidence is the actual Railway restart record in S06.

The next implementation adds an admin-only environmental fixture route for the
memory simulator (`POST /api/v1/farms/:farmId/simulator/scenario`). It is absent in
production, MQTT configurations, and either live-command flag configuration.
Fixtures change sensor conditions while preserving actuator state and applied
guard thresholds, allowing actual hosted rain/night/empty-tank/DHT-failure tests.
The corresponding hosted automation harness is prepared but has not run; deploy
it after the active 30-minute measurement finishes, then execute
`tools/scripts/check-staging-automations.mjs`. It restores original settings,
normal simulator conditions and paused/off outputs in cleanup. Do not mark S03
passed until the hosted results exist.

The protected fixture route also supports `telemetry-stall`, which suppresses
telemetry capture for exactly eight seconds while device timers continue running.
It automatically recovers; selecting a normal scenario ends it early. A regression
checks that the simulated pump stops on time even while telemetry is suppressed.
The readiness response now includes API-generated millisecond `serverTime` for
clock calibration. `tools/scripts/measure-staging-latency.mjs` bounds clock offset
with request round trips, samples WSS latency for two minutes, then checks the
hosted stale warning/control rejection and paused recovery. These hosted checks
are prepared, not yet observed; run them after deployment.

The user reports that their Railway plan does not include the backup functionality
and explicitly wants to avoid it. Do not upgrade the plan or enable paid provider
backups. Actual provider reads returned no backups, no schedules and PITR disabled.
Attempts to create a manual snapshot and configure daily/weekly backups returned
`OAUTH_INSUFFICIENT_GRANT`, including after successful reauthorization; neither
change was applied. The paid provider feature is no longer being pursued.
The user subsequently explicitly chose **defer backup/restore entirely**, including
logical dump/local restore. S12 is an accepted scope deferral, not a passed test.
Do not perform backup/restore work unless the user reopens that scope. Keep this
exception visible in the eventual G08/release assessment; other G08 checks continue.

A read-only 30-minute Chromium observation started at `2026-09-21T12:13:42.167Z`
against API `ad1706e332bd2a2679294e57c56ae4af2f7c35db` using
`tools/scripts/measure-staging-browser.mjs`. It records browser JS heap, snapshot
intervals and approximate delivery/telemetry age; cross-machine clock offset is
not independently measured, so these ages alone cannot prove the latency target.
The active process must be polled to completion before recording results or
deploying a new API during this observation. Provider memory metrics are accessible
and will be collected for the matching window separately.

That observation completed at `2026-09-21T12:43:42.439Z`: 1,800,271 ms,
2,280 snapshots, one controller epoch, zero page errors, unchanged API SHA.
Snapshot interval p95 was 808 ms. Approximate telemetry age p95 was 377 ms, but
the uncalibrated clock caveat still applies. Railway process memory for the same
window averaged 101.925 MB and peaked at 110.461 MB; these are observed values,
not proof of leak freedom. Raw browser JS heap samples and provider summary:
`releases/staging-browser-measurement-2026-09-21.json` and
`releases/staging-provider-memory-2026-09-21.json`.

The user completed a real WebKit GitHub sign-in as mattiasli. The verifier passed
its authenticated-user and GitHub-authorization assertions, then failed because
the callback Set-Cookie header was not exposed. A fresh local fixture reproduced
Windows WebKit omitting Set-Cookie on HTTP 302 responses and reporting a server-set
Lax cookie as None. This is an instrumentation limitation, not a demonstrated OAuth
failure. Cookie SameSite verification remains explicitly unqualified. The verifier
now records that limitation instead of treating it as failed authentication; its
subsequent editor/WSS steps were not reached in that particular real-login run.
The separately recorded imported-session WebKit editor/WSS checks passed.

## Hosted restart exposed missing browser reconnect (2026-09-21)

The deployed rerun on `62259e8449493af48a037e054d89665253d941dc` passed:
automatic browser WSS recovery, new controller epoch, settings/revision retained,
paused automations and fan/pump off. Readiness-to-new-owner observation was 14,459 ms
(includes the operator restart command, not a pure outage measurement).
See `releases/staging-restart-2026-09-21.json`. The secondary account
`xueshanmattiasli` completed actual browser OAuth; its isolated SmartFarm viewer
session is saved locally, with no GitHub cookies retained.

The next access-control audit found no periodic socket session validation and no
immediate socket closure on membership changes. The fix validates session absolute
and idle expiry, account disablement and farm membership every 20 seconds, suspends
publication during database checks, closes on validation failure, and fences pending
authentication across local revocation. Role changes revoke sessions and close active
sockets; unchanged roles preserve sessions. Existing GitHub usernames are preserved.
Regression coverage includes actual PostgreSQL role-change/socket/HTTP revocation,
idle expiry, disablement, stalled/failed database checks and in-flight authentication.
Deployed fix: `9b55910b01ff7b6a6f49a302e26df5812c4f43e8`.
The actual hosted distinct-user check passed: viewer reads allowed, controls disabled,
writes/admin changes denied; removing access closed the socket with code 4002 in
615 ms including the administrative HTTP request. Reads, writes and new tickets
were rejected afterward, including after refresh. Primary admin access survived;
the temporary secondary membership/allowlist was removed and its session is now
revoked. See `releases/staging-revocation-2026-09-21.json`. Local validation passed
125 unit tests and 27 integration tests (one Windows process test skipped), lint
and typecheck. Railway deployment `d5a192d2-83b0-4659-96a4-47bedcc4d492` and both
Vercel deployments succeeded. Host deployment: `68yGi56FAky6ffWqNqtvz3W9gbEe`;
the immutable remote remains pinned to the compatible `9abcf36` release.
All five CI checks, including Linux integration and the aggregate gate, passed:
https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35597251240

Next distinct-user concurrency test needs temporary operator access and a fresh
secondary sign-in: the viewer session was intentionally invalidated by S07.
G08 remains pending for the other checklist scenarios; S07 does not prove S05.

The real Railway restart drill on `e48f5db` confirmed persisted settings/revision,
a new controller epoch, paused automations, and fan/pump off after recovery.
The browser did not reconnect WSS within 40 seconds after controller recovery;
see `releases/staging-restart-before-reconnect-2026-09-21.json`. Keep this failed
qualification evidence; polling recovery alone does not satisfy plan section 9.3.

The host now reconnects with a fresh single-use ticket for every attempt,
exponential backoff plus jitter capped at 30 seconds, and abortable ticket/retry
waits. A connection/authentication deadline and a silent-stream deadline restore
polling instead of leaving a dead socket marked live. Old socket listeners/timers
are removed when the attempt ends. Unit regressions cover fresh tickets, late
old-socket frames, stalled streams, bounded retries, and cancellation. All 119 unit
tests, typecheck and lint passed; the successful hosted rerun is recorded above.

Provider login and the secondary user's browser sign-in are now complete.

## Provider access and hosted qualification resumed (2026-09-21)

Railway and Vercel CLI logins now work. The user completed GitHub OAuth in an
isolated Chromium browser. Only its SmartFarm session cookie is stored locally
in ignored `.infra/staging-auth.json`; no GitHub cookies are saved or committed.

- Removed Vercel SSO protection on the compiled automations remote project.
  The immutable `9abcf36` remote now loads anonymously, including child assets.
- Pinned the host's production build variable to that immutable URL and rebuilt
  the tested source. Host deployment `3VDzyA5SJaWovBphE2sv5xiZPfHS` is Ready and
  aliased to `smartfarm-host.vercel.app`; authenticated browser requests prove it
  actually loads the pinned remote. The observed pair is in `releases/staging.json`.
- Chromium and WebKit render the editor, receive authenticated WSS snapshots, and
  pass manual fan/All off plus remote-failure fallback/Start/Pause/control checks.
  Sanitized results are in `releases/staging-browser-2026-09-21.json` and
  `releases/staging-controls-2026-09-21.json`. Outputs are off and automations paused.
- WebKit on Windows reports imported Lax cookies as None, reproduced with a
  synthetic cookie. Its OAuth redirect/cookie qualification remains pending;
  imported-session rendering is separate evidence, not a replacement.
- Railway reported no resolved repository config. Linking `railway.toml` was
  rejected as deprecated. Applied supported service settings directly: one
  replica, sleep false, `/health/ready` with 30-second timeout, 15-second drain,
  and `npm run db:migrate` pre-deploy (120-second timeout). API reads confirmed
  saved settings; inspect the next deployment to verify execution. Migrate to
  Railway's supported infrastructure configuration in the coordinated CD work.

G08 is still pending: full WebKit OAuth, all automations, distinct-user role and
revocation tests, concurrent editing, provider outage/restart/overlap/rollback,
backup restore, measurements, and CI-gated ordered deployment.

## CI evidence and aggregate gate (2026-09-21)

CI now emits JUnit reports for unit, integration, federation and E2E suites,
plus browser HTML reports and failure traces/screenshots. Per-suite artifacts
include the source SHA and expire after seven days. They contain isolated test
fixtures only; hosted OAuth sessions and provider data are not uploaded here.
The upload action is pinned to the verified `actions/upload-artifact` v7.0.0 commit.

`smartfarm-required` runs after all four jobs and fails unless every prerequisite
succeeded, including when one was skipped or cancelled. It is the intended branch
protection/release prerequisite. Adding this job alone does not configure branch
protection or make the current provider Git hooks wait for CI; those settings and
the coordinated deployment workflows remain unfinished.

## Database lock-session recovery follow-up (2026-09-21)

- Dedicated PostgreSQL lock clients now handle idle error/end events, invalidate
  ownership, discard failed connections, and bound connect/query waits to two seconds.
- Controller ticks and mutations detect a lost session, pause, and retry acquisition.
  Recovery remains paused. Queued publishes recheck ownership at dispatch and reject
  work from an earlier ownership generation, including after successful reacquisition.
- An isolated PostgreSQL regression terminates the actual advisory-lock backend,
  holds its lock with a competing session, verifies rejected mutations/no publishes,
  releases the competitor, and observes automatic paused recovery.
- A unit regression holds a command across loss/reacquisition and verifies no replay.
  This covers explicit session termination; it does not qualify a hosted network
  partition, full database outage, or provider recovery. S08 remains pending.

## Shutdown and release metadata follow-up (2026-09-21)

Deployed source: `a355e207aa3aaeeee64a0bac71b2acf2c2079473`. Provider integrations remain unconfirmed;
GitHub CI and automatic Railway/Vercel deployment access work through Git.

Implemented:

- API handles SIGTERM/SIGINT, drains once before Fastify closes, then closes
  sockets/controller/database. Shutdown has a 12-second deadline inside the
  configured 15-second Railway window. The container starts Node directly as PID 1.
- Cleanup stop attempts are bounded to 2.5 seconds, require healthy ownership,
  suppress late health-check continuations, and never publish in live read-only mode.
- API health/diagnostics report `RELEASE_SHA` or Railway's Git SHA. Host/remote
  builds use `VITE_RELEASE_SHA` or Vercel's Git SHA; dashboard diagnostics show it.
  Public smoke now requires actual 40-character API/remote SHAs and can check
  `EXPECTED_API_SHA` / `EXPECTED_REMOTE_SHA` against a release candidate.
- Docker base is pinned to the observed/tested image digest.

Evidence before deployment:

- Typecheck and lint passed; 114 unit tests passed; frontend import and built
  secret-canary checks passed; production federation build/browser proof passed.
- Windows PostgreSQL/MQTT suite: 25 passed, one Unix-signal test explicitly skipped.
- New `tests/integration/process-shutdown.test.ts` passed in the Linux Docker image:
  two real API processes, old owner running automations, successor HTTP-ready while
  waiting, SIGTERM exit 0, automatic takeover, and paused successor. Linux CI runs it.
- `docker build -t smartfarm-g08-shutdown:local .` passed. `test:container-shutdown`
  tested the actual image entrypoint with network disabled: SIGTERM, exit 0,
  shutdown complete in 424 ms. It removes only its temporary test container.
- Follow-up dependency triage resolved the build-tool advisories with a scoped
  `adm-zip` 0.6.1 override under the federation DTS plugin. Full npm audit reports
  zero vulnerabilities; federation production build/browser proof passed again.
  CI now rejects high/critical dependency advisories.

G08 remains pending: immutable remote access/pinning, authenticated browser and
provider recovery drills, backup restore, coordinated release gating, and measurements.
All four CI jobs passed in run 35587182640. Railway and both Vercel deployments
succeeded. Public smoke at `2026-09-21T10:11:38.456Z` confirmed controller owner,
both live flags false, and API/remote identities matching the deployed source.
See STAGING_ACCEPTANCE.md for the observed deployment IDs.

## Previous deployed handoff (2026-09-21)

The user explicitly authorized implementing the plan, committing, and deploying.
The tested P13 changes were committed and pushed as
`1c41af6cf605de8e7578292993e1b1c48b66372a` (`Fix staging controller handover and editor recovery`).
GitHub CI completed successfully: https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35575055409
All four jobs passed: checks, integration, federation, e2e.

Git-linked Railway and both Vercel projects deployed successfully. Deployment IDs
and immutable URL candidates are recorded in `docs/releases/staging.json` for this
observed release; later documentation commits may trigger additional deployments.

Public smoke at `2026-09-21T07:56:27.187Z` passed all four current checks:
the API is now **controller `owner`**, staging/memory simulator, both live flags false;
anonymous proxy responses are no-store; nine remote assets load cross-origin;
missing remote assets return 404. The immediate stuck-controller blocker is resolved.

Newly verified blocker: the exact Vercel deployment URLs for both host and remote
return HTTP 302 to unauthenticated requests, while the public aliases work. Do not
pin the remote's protected deployment URL until clean-browser access is enabled.
The remote still reports an empty release SHA. G08 remains pending.

Next actions:

1. Connect Railway and Vercel integrations for project settings/logs, restart,
   rollback, and isolated backup restore access. These integrations were discovered
   but are not yet confirmed connected. Existing Git credential access already
   handles GitHub push, CI, and deployment metadata; no new GitHub token is needed.
2. Enable public access for approved immutable remote assets, pin the verified
   remote URL in the host build, and provide release SHA metadata.
3. Complete authenticated staging browser checks and the S06–S14 recovery/metrics
   evidence. Successful deploy status and public HTTP health do not pass all G08.

Live hardware is still out of scope until the plan's production/hardware gates.

## Implementation session (2026-09-21, P13 recovery qualification)

Source: `master` at `ad76ef2` plus uncommitted P13 changes. Nothing from this
session has been pushed or deployed. Live commands and pumping remain disabled.

Completed locally:

- Added `docs/STAGING_ACCEPTANCE.md` with S01–S14 evidence requirements and
  `docs/releases/staging.json` with public project mapping. Unknown deployment IDs
  remain null; this is not yet an immutable release manifest.
- Added real-browser regression cases for failed remote loading with functional
  sensors/Pause/All off, retry recovery, clean-editor updates, dirty/empty draft
  preservation, conflict reload/Cancel, and a real API 409 on an overtaken save.
- Fixed editor dirty tracking to use its accepted baseline, rather than incoming
  live settings. Accept the editor's own save response even if its new revision
  already arrived by WebSocket. Disable field edits while saving.
- Fixed remote retry: a document reload clears cached failed imports. Remounting
  the same React lazy component did not recover; the browser test reproduced it.
- Reproduced and fixed a deployment handover defect: a waiting controller tried
  the advisory lock only once. It now retries every second, serializes attempts,
  reloads current settings/runtime after acquisition, stays paused, and cancels
  acquisition on shutdown. Waiting instances do not write runtime/history.
- Extended the real PostgreSQL overlap test to require automatic takeover after
  the old owner closes and to verify settings changed while waiting survive.
- The E2E harness forces isolated memory-simulator configuration. Windows cleanup
  waits for taskkill to finish; previously the harness left test servers behind.

Public hosted observations at `2026-09-21T07:39:06.307Z`:

- `npm run check:staging-public` is a new read-only smoke using a fresh headless
  Chromium context. It intentionally exits nonzero for the current deployment.
- Host proxy session response: unauthenticated, local login disabled, no-store.
- Actual cross-origin federation container/editor import: nine remote assets,
  valid JS/CSS and CORS, contract major 1; missing remote module returns 404.
- **Hosted API returns 200 but controller is `waiting_for_owner`.** Both live flags
  are false, staging memory simulator, database/OAuth configured. This blocks G08.
- Remote uses mutable alias and reports empty release SHA. Immutable artifact
  pairing and provenance remain unresolved. Logged-in OAuth/WSS was not rerun.

The reproduced local handover defect plausibly explains the hosted waiting state;
Railway logs and a deployed rerun are still needed to establish the hosted cause.

Validation after the fixes:

- `npm.cmd run typecheck` — pass.
- `npm.cmd run lint` — pass.
- `npm.cmd run test:unit` — 112 passed.
- `npm.cmd run test:integration` — 25 passed against local PostgreSQL and loopback MQTT.
- `npm.cmd run check:frontend-imports` — pass.
- `npm.cmd run test:federation` — pass (production host/remote builds and browser proof).
- `node tools/scripts/run-e2e-test.mjs` — 6 passed.
- `npm.cmd run check:client-secrets` — pass on built frontend artifacts.
- `git diff --check` — pass.

Builds still report large Fluent shared chunks; the dev servers log Keyborg disposal
warnings. Neither failed the browser assertions. Performance qualification remains
an explicit G08 task; these warnings have not been treated as measured failures.

Next: deploy the reviewed fixes to simulator staging, verify owner acquisition and
paused restart on Railway, then complete S01–S14. Provider deployment/log access
and authenticated browser sessions are needed for those hosted operations.
CI-gated staging deployment, immutable host/remote mapping, rollback, backup restore,
DB-failure/session-revocation drills, WebKit and 30-minute measurements remain open.
**P13/G08 is not complete. Do not advance to physical commands or P14 yet.**

## Previous handoff (2026-09-18; superseded by current handoff above)

Read this section before changing code. Live pump stays **disabled**. Do not invent secrets. Do not commit `.env` or OAuth client secrets.

**Repo:** `https://github.com/mattiasli/TTSmartFarmWebApp` · default branch `master`  
**Local folder:** `smartFarmRemoteWebApp/`  
**Plan:** `IMPLEMENTATION_PLAN.md` packages P00–P15. Completed through **P12** plus **G02 hosted topology proof** on simulator staging. **P13 remaining:** extra staging failure/rollback smokes (G08). **P14/P15** need hardware and production HiveMQ; not started.

### What already works

- Local simulator: `npm run dev` → http://127.0.0.1:5173
- CI on GitHub Actions (`smartfarm-web-ci.yml`): checks, integration (Postgres service), federation, e2e — last observed all green on `4b9968d`
- Hosted **simulator** staging (not the physical farm):
  - Host: https://smartfarm-host.vercel.app
  - Remote: https://smartfarm-automations.vercel.app
  - API: https://default-service-production.up.railway.app
  - Observed `GET /health/ready`: `status: ready`, `controller: owner`, `appEnv: staging`, `farmMode: simulator`, `liveCommandsEnabled: false`, `livePumpEnabled: false`, `databaseConfigured: true`, `githubOAuthConfigured: true`
  - Observed browser: GitHub login as `mattiasli`, dashboard sensors, **live socket**, Simulation banner, automations paused after backend start, host Start/Pause/All off visible

### Public IDs (not secrets)

- Bootstrap admin GitHub id `43301236` / username `mattiasli`
- Railway project name `smartfarm-staging` (Railway UI environment is labeled `production`; **app** `APP_ENV` must stay `staging`)
- Railway service `_default-service`, public host `default-service-production.up.railway.app`
- Vercel projects `smartfarm-host` (root `apps/dashboard`) and `smartfarm-automations` (root `apps/automations-remote`)
- GitHub OAuth app name `TT SmartFarm staging`
  - Homepage `https://smartfarm-host.vercel.app`
  - Callback **exactly** `https://smartfarm-host.vercel.app/api/auth/github/callback`

### Secrets live only in Railway (never git, never Vercel)

`DATABASE_URL` (shared from Postgres), `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`. No `HIVEMQ_*` on staging.

### Code SHAs that matter

| SHA | Why |
|---|---|
| `4b9968d` | P12 CI/docs |
| `1c35e12` | Vercel Node 24.19 engines + monorepo install commands |
| `b7ddf86` | `Dockerfile`, `railway.toml`, `docs/DEPLOYMENT.md` |
| `5294fe8` | Host `/api` rewrite → Railway |
| `440a79e` | API listens on `process.env.PORT` and `0.0.0.0` when not local |

### Staging ops facts that blocked us (do not re-learn)

- Railway **Connect Repo** needs the **Railway GitHub App installed**, not only OAuth-authorized.
- Public domain **target port** must match the process listen port. Staging used target **3001** and Railway variable `PORT=3001`. Mismatch → Railway “Application failed to respond” even when deploy is Active.
- `APP_ENV` on Railway must be **`staging`**. `APP_ENV=production` + `FARM_MODE=simulator` throws at startup.
- Do **not** add Vercel `VITE_*` variables onto Railway. Do **not** put OAuth secret on Vercel.
- Vercel `VITE_*` vars must be type **Config**, not **Secret**. A Secret `VITE_` cannot be saved and cannot be converted; **Delete** and recreate as Config.
- After changing `VITE_*`, **Redeploy** the host (build-time bake). Redeploy is Deployments → latest → ⋯ → Redeploy (not a top-right Deploy button).
- `vercel.json` rewrite `/api/:path*` must stay **before** SPA fallback.

### Next concrete work (do not skip to hardware)

1. Confirm remote `https://smartfarm-automations.vercel.app/remoteEntry.js` is JS from a logged-out browser (G01/G02 remote CORS).
2. Remaining P13/G08: backend restart stays paused, host emergency controls if remote fails, two-browser settings conflict, no auto-resume after deploy.
3. Do **not** enable `LIVE_COMMANDS_ENABLED` or `LIVE_PUMP_ENABLED`. Do **not** point staging at HiveMQ.
4. P14 production read-only only after G08 and a dedicated backend MQTT credential.

### Local commands

See `docs/LOCAL_DEVELOPMENT.md`. `npm run typecheck` / `lint` / `test:unit` / `test:integration` were last fully run at P12 (`110` unit / `25` integration).

## Session 2026-09-18 (P13 G02)

Source SHA: `master` at `440a79e` plus this progress/docs commit.

Completed: hosted simulator topology proof — Railway API + Postgres, Vercel host/remote, GitHub OAuth through `/api` rewrite, ticket/WSS snapshot, dashboard UI. Live flags false.

Unresolved for full P13/G08: remote clean-browser chunk check, deploy overlap/rollback drill, backup restore, latency measurements. Staging GitHub Action deploy workflows still absent (manual dashboard deploys).

## Session 2026-09-18 (P13 start)

Railway project `smartfarm-staging` has Postgres linked. Public API host is `default-service-production.up.railway.app`. Vercel host `https://smartfarm-host.vercel.app` and remote `https://smartfarm-automations.vercel.app` exist. Host `/api` rewrite now targets that Railway origin. Live commands/pump stay false. **Superseded:** G02 login/WSS/snapshot later succeeded; see Handoff and P13 G02 above.

## Session 2026-09-18 (P12)

Source SHA / working-tree scope: `master` at `879c48f` plus local P12 changes.

Completed this session: **P12** CI gate, frontend import/secret scans, history/backpressure bounds, and operator docs.

Notes:

- `smartfarm-web-ci.yml` now splits lint/types/unit, Postgres service integration, built federation + secret canaries, and Chromium e2e via `run-e2e-test.mjs`. Actions are pinned to commit SHAs. No HiveMQ/OAuth/Railway secrets in CI.
- History queries reject >30 days or >2000 buckets. Realtime sockets close on 1 MiB backpressure and session/total limits.
- Docs: `docs/RUNBOOKS.md`, `docs/CONTRACTS.md`, `docs/RELEASE.md`, hardware template. Staging/production deploy workflows are not added; G02 still needs Vercel/Railway/OAuth.
- Live commands/pump remain disabled.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 110 passed
- `npm run test:integration` — 25 passed
- `npm run check:frontend-imports` — pass
- `npm run check:contracts` — 62 passed

Next concrete task: **P13** hosted staging (blocked on G02 cloud accounts). Live pumping stays disabled.

## Session 2026-09-18 (P11)

Source SHA / working-tree scope: `master` at `0d2e409` plus local P11 changes.

Completed this session: **P11** federated editor draft UX, companion thresholds, contract/timeout loader, and G06 helper coverage.

Notes:

- Five cards use friendly titles, slider + number inputs, current readings/reasons, Apply/Cancel, and a master-paused banner. Empty number fields stay incomplete instead of snapping.
- Companion fan/light edits keep a one-unit gap. Invalid tank pairs remain editable and block Apply. Dirty drafts survive same-revision telemetry; a newer revision shows a conflict with reload.
- Host loads the remote with an 8 s timeout and rejects an unsupported contract major before render. Host Pause/All off stay outside the remote. Night-light 2559 vs 3380/3560 classifies immediately as dark.
- Live commands/pump remain disabled.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 105 passed
- `npm run test:integration` — 25 passed

Next concrete task: **P12** CI, documentation, and operational checks. Live pumping stays disabled.

## Session 2026-09-18 (P10)

Source SHA / working-tree scope: `master` at `1a1a9ca` plus local P10 changes.

Completed this session: **P10** host routes, live snapshot UI, history/events APIs, and host Pause/All off.

Notes:

- Host routes cover login, dashboard, automations, history, settings, access-denied, and not-found. `/` still includes Dashboard plus the federated editor so G01/`host-all-off` stay on the home page.
- Live client uses a one-shot WS ticket with HTTP poll fallback; envelope epoch/sequence filtering is unit-tested. WS snapshots overlay session permissions so viewers cannot inherit controller `canControl`.
- Sensors, pending vs reported actuator labels, LCD n/16 dialog, history table/chart, paginated events, diagnostics/members, and host-owned Start/Pause/All off are in the Fluent host.
- Memory sessions mint realtime tickets. History/events return empty arrays without PostgreSQL. Live commands/pump remain disabled.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 93 passed
- `npm run test:integration` — 25 passed

Next concrete task: **P11** federated automation editor polish (G06). Live pumping stays disabled.

## Session 2026-09-18 (P09)

Source SHA / working-tree scope: `master` at `7ba4b8e` plus local P09 changes.

Completed this session: **P09** automation engine persistence, command-service effects, and G05 rule coverage.

Notes:

- Engine effects (except `pumpguard`) go through the same command service as manual actions; automation actor scope does not take manual ownership.
- Runtime attempts, cooldown, last pump stop, guard target/status, and manual overrides persist and restore. Restart stays paused until explicit resume.
- Fake-time coverage for T029–T058: irrigation gates, cooldown/max attempts, rain delay, alarm LCD/beep, guard echo, cooling/lighting, motion hold.
- Loopback MQTT proves an automation command sequence. Live commands/pump remain disabled.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 86 passed
- `npm run test:integration` — 25 passed including runtime restore and local MQTT automation sequence

Next concrete task: **P10** dashboard history, live WS UI, and host Pause/All off. Live pumping stays disabled.

## Session 2026-09-18 (P08)

Source SHA / working-tree scope: `master` at `cbd6b53` plus local P08 changes.

Completed this session: **P08** durable command confirmation, stop supersession, and pump restrictions.

Notes:

- Commands reserve-before-dispatch, stay idempotent, and never replay after restart. Pending rows become `uncertain`.
- State match uses only a newer packet in the current MQTT epoch. LCD/beep stay `sent` (`not_reported`).
- Stops supersede unpublished starts; already-sent work is not unsent. Publishes are serialized; late start callbacks are ignored.
- Pump pulses require rain/live/guard gates, a 3.5 s backup `off`, and an 8.5 s unresolved watchdog. Another pulse is blocked until resolved.
- `GET /api/v1/farms/:farmId/commands/:commandId` returns the current record. Live commands/pump remain disabled.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 75 passed
- `npm run test:integration` — 23 passed including restart/no-replay and in-process loopback MQTT match

Next concrete task: **P09** persist/MQTT automation sequences on this command service. Live pumping stays disabled.

## Session 2026-09-18 (P07)

Source SHA / working-tree scope: `master` at `4354afd` plus local P07 changes.

Completed this session: **P07** controller ownership, MQTT epochs, drain, and diagnostics.

Notes:

- Dedicated Postgres advisory lock is acquired at API start. A second process stays `/health/ready` with `waiting_for_owner` and mutations return 503 `CONTROLLER_UNAVAILABLE`.
- `/health/ready` does not wait for lock ownership or farm telemetry.
- MQTT reconnects mint a new epoch, drop current telemetry, and pause automations until explicit resume.
- Retained telemetry is ignored. Age 4000 ms is stale.
- Drain pauses automations, attempts a bounded pump off while still owner, then releases the lock.
- Live commands/pump remain disabled.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 59 passed
- `npm run test:integration` — 21 passed including two-process lock exclusion

Next concrete task: **P08** durable command confirmation (state match, stop supersession, uncertain results) against the local broker.

## Session 2026-09-18 (P06)

Source SHA / working-tree scope: `master` at `396f16c` plus local P06 changes.

Completed this session: **P06** backend auth, CSRF/origin/role checks, GitHub OAuth PKCE flow, membership admin APIs, single-use WS tickets, and first-frame WebSocket authentication.

Notes:

- Local loopback login remains for `APP_ENV=local` and is absent from production route usefulness (`404` in production).
- GitHub OAuth start/callback persist hashed state, browser binding, and PKCE verifier in Postgres. Unknown GitHub IDs are denied; they are not auto-admin.
- Realtime: `POST /api/v1/realtime/tickets` plus `GET /ws` with first-frame `authenticate`. Tickets require Postgres sessions.
- Dashboard shows a GitHub sign-in screen when unauthenticated and not in local auto-login mode.
- Hosted G02 (real GitHub app + Vercel cookie/WSS) is still not executed. No OAuth client secret was committed.

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 54 passed
- `npm run test:integration` — 20 passed (P05 repositories + P06 auth)

Next concrete task: **P07** persistent MQTT/controller ownership on the dedicated advisory lock. Live pumping stays disabled.

## Session 2026-09-18

Source SHA / working-tree scope: `master` at `661d13e` plus local P05 changes. Dedicated GitHub remote: `https://github.com/mattiasli/TTSmartFarmWebApp`. Parent farm repository files were not modified.

Completed package IDs: P00, P01, P03, P04, **P05**, P09 domain engine, P10 sensors/controls plus host Pause/Start, P11 federated five-card editor (probe kept for G01).

P05 work this session:

- Added [apps/api/migrations/002_p05_complete.sql](apps/api/migrations/002_p05_complete.sql) for allowlist, OAuth flows, WS tickets, automation runtime, farm preferences, command/event columns, and check constraints.
- Added repositories in [apps/api/src/db](apps/api/src/db): config revision transactions, command idempotency reservation, session/ticket expiry, history sampling/aggregation/pagination, retention batches, and a dedicated advisory-lock connection.
- Local seed remains bootstrap GitHub id `43301236` / username `mattiasli` (public numeric id only).
- Isolated Postgres tests in [tests/integration/repositories.test.ts](tests/integration/repositories.test.ts).

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 47 passed
- `npm run test:integration` — 14 passed against Docker Compose Postgres 16 (`sf_p05_*` databases created and dropped)

Current environment mode and live-command flags: local simulator default; `LIVE_COMMANDS_ENABLED` and `LIVE_PUMP_ENABLED` remain false. API still uses in-memory sessions unless `DATABASE_URL` is set after `npm run infra:up` and `npm run db:migrate`.

Known limitations / failed gates: G00 and G01 passed locally. G02 hosted topology not executed. G03–G10 not executed. Live pumping stays disabled. GitHub OAuth app is not registered. Sessions/tickets are persisted when Postgres is configured, but P06 auth/OAuth/WSS routes are not implemented.

Missing inputs (names only, never secret values): Railway/Vercel deployment access not required for local work. GitHub OAuth app not registered yet.

Next concrete task: **P06** — GitHub OAuth, opaque Postgres sessions, CSRF, farm-scoped roles, and single-use WS tickets on this schema. Hosted P02 still waits on Vercel/Railway.

## Session 2026-09-17

Source SHA / working-tree scope: local nested git in `smartFarmRemoteWebApp/` (HEAD `aca4fec` at session start). Dedicated GitHub remote: `https://github.com/mattiasli/TTSmartFarmWebApp`. Parent farm repository files were not modified.

Completed package IDs: P00, P01, P03, P04, P05 (SQL present), P09 server automation engine, P10 sensors/controls plus host Pause/Start, P11 federated five-card editor (probe kept for G01).

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 46 passed including irrigation/cooling/lighting/pause/stale/guard engine cases
- `npm run test:federation` — 1 passed locally; GitHub Actions green on `510e2b6`

Built/deployed artifact identifiers: local only. Remote entry `apps/automations-remote/dist/remoteEntry.js`. Host `apps/dashboard/dist`.

Current environment mode and live-command flags: local simulator planned; `LIVE_COMMANDS_ENABLED` and `LIVE_PUMP_ENABLED` remain false for any live adapter.

Known limitations / failed gates: G00 and G01 passed locally. G02 hosted topology not executed. G03–G10 not executed. Previous physical pump freeze remains unresolved; live pumping stays disabled. GitHub remote URL is known; this folder's git has no `origin` until it is added and pushed.

Missing inputs (names only, never secret values): Railway/Vercel deployment access not required for local work. GitHub OAuth app not registered yet. GitHub push credentials were not used in this session.

GitHub: `origin` is `https://github.com/mattiasli/TTSmartFarmWebApp.git`. Scaffold commit `4e7a3dd` was pushed to `master`.

Next concrete task: GitHub OAuth/sessions in Postgres (P06) and the federated automation editor (P11). Hosted P02 still waits on Vercel/Railway. Docker Desktop was not running; Postgres migrations exist but local demo uses in-memory stores. Live pumping stays disabled.

### P00 notes

- Inspected this folder's git: dedicated `.git`, branch `master`, initial commit `aca4fec` containing the implementation plan and credential templates. `private-setup/` is ignored.
- Parent farm working tree remains dirty with firmware/desktop automation work. Those files are out of scope and were not changed.
- Firmware evidence re-checked from working tree: topics `smartfarm/telemetry` and `smartfarm/cmd/#`, 800 ms telemetry, 22-field guard extension present, pump pulse + 4 s firmware cap, 400 ms beep, rain at `steam >= 800`.
- Desktop protocol freshness remains 4 s. Command allowlist and LCD ASCII rules match `SmartFarmRemote3D/electron/protocol.cjs`.
- GitHub bootstrap username `mattiasli` resolves to public numeric id `43301236`.
- All generated project files stay inside `smartFarmRemoteWebApp/`. GitHub workflows will live in this folder's `.github/workflows` because this directory is the web app repository root.
