# P13 staging acceptance (G08)

G08 is **pending**. Local tests support the gate but do not qualify the hosted release.
Use simulator staging only: `APP_ENV=staging`, `FARM_MODE=simulator`,
`SIMULATOR_TRANSPORT=memory`, both live flags false, and no HiveMQ credentials.

## Release under test

Record the actual deployment mapping in [releases/staging.json](releases/staging.json).
Null fields mean not yet observed. The September 18 topology observation is historical;
it is not evidence that the current deployment matches the current checkout.
Never record cookies, OAuth codes, tickets, tokens, database URLs, or credential values.

## Acceptance record

For each execution record UTC date, source/deployment IDs, browser/version, action,
expected result, observed result, and a sanitized evidence location. Mark failures
explicitly. Do not infer successful actuation from HTTP acceptance.

| ID | Procedure and required result | Evidence/status |
|---|---|---|
| S01 | From a logged-out browser, load the pinned remote entry and all imported JS/CSS. Verify content types, CORS, no login interstitial, and a genuine 404 for a missing chunk. Render the editor with no unexpected script errors. | Passed September 21 on recorded 9abcf36 pair: anonymous immutable asset smoke and authenticated Chromium/WebKit render |
| S02 | Sign in through the host `/api` rewrite; inspect secure HttpOnly host cookie, private/no-store responses, snapshot and authenticated WSS. Repeat in Chromium and WebKit. | Chromium OAuth and cookie checks passed; both browsers pass authenticated snapshot/WSS. WebKit uses imported app session; its OAuth/cookie qualification pending |
| S03 | Exercise simulator manual commands and all five automations. Check reported vs pending states, guard synchronization, permissions, and continued server automation after browser closure. | Hosted fan on/off confirmed in Chromium/WebKit; full automation and permission checks pending |
| S04 | Block remote requests in the browser. Verify fallback, continuing sensor updates, successful host Pause, and All off stopping a simulated running output. | Hosted Chromium/WebKit fallback, fresh telemetry, Start/Pause, fan and All off checks passed September 21; see staging-controls evidence |
| S05 | Open two isolated sessions. An untouched editor follows another session's save. A dirty editor keeps its draft and shows conflict. Reload accepts saved settings; a save overtaken in transit returns 409 without overwrite. | Passed on ad1706e in Chromium with mattiasli and xueshanmattiasli: all listed conflict cases plus successful operator save. Original settings restored, temporary access removed. Evidence: releases/staging-concurrency-2026-09-21.json |
| S06 | Start simulator automations, restart the backend, reconnect browsers. Verify new controller epoch, master paused, no command replay, settings retained, and explicit resume required. | Actual Railway restart rerun on 62259e8 passed automatic browser WSS recovery, retained settings/revision, new epoch, paused automations and fan/pump off. Evidence: releases/staging-restart-2026-09-21.json; earlier failed drill retained |
| S07 | Revoke a signed-in user's access with a second admin. Verify socket closure and rejected reads/writes, including after refresh. Preserve the last admin. | Passed on 9b55910 using distinct GitHub users: viewer read/control/admin restrictions, socket closure code 4002 in 615 ms, revoked reads/writes/tickets and refresh denied, primary admin retained, temporary access removed. Evidence: releases/staging-revocation-2026-09-21.json |
| S08 | Interrupt staging database access in a controlled window. Verify rejected mutations, no publishing after ownership loss, and paused recovery. Restore original connectivity. | Local actual lock-session termination/competing owner/paused recovery and queued no-replay regressions pass; full outage and hosted execution pending |
| S09 | Exercise actual broker loss/reconnect with the isolated local MQTT suite; verify stale state, no queued replay, and explicit resume. Hosted memory transport has no broker; also exercise hosted backend/socket interruption. | Actual loopback broker shutdown/restart, offline rejection, new MQTT epoch, no queued actuation and explicit resume passed; three MQTT tests recorded in releases/staging-local-mqtt-2026-09-21.json with source hashes. Hosted backend/WSS recovery passed in S06 |
| S10 | Deploy a compatible new API while the old owner drains. Record both deployment IDs, readiness while waiting for ownership, one owner, bounded drain, and paused handover. | Linux two-process SIGTERM/paused takeover and Docker PID-1 shutdown passed locally; complete Railway drill pending |
| S11 | Roll back API to a schema-compatible version and host/remote as a recorded immutable pair. Verify login, assets, snapshots, paused automations, and no replay. | Pending immutable release mapping and hosted execution |
| S12 | Restore an actual staging backup into a new isolated database. Verify migrations, roles, settings revisions, events/history; revoke restored sessions; start simulator paused with live flags false. Record duration and backup age. | Explicitly deferred by the user on September 21, including logical dump/local restore. No backups/schedules exist. Record as a scope exception, never as passed; do not perform this work unless reopened by the user |
| S13 | Measure normal telemetry-to-browser latency (<2 s), stale indication (~4 s plus scheduling), command acceptance (<1 s), and memory over 30 minutes. Record sample counts, percentiles, process/browser memory, row/index size and retention behavior. | Pending measurements; targets are not claimed results |
| S14 | Verify CI for the exact release SHA; coordinated deploy authority, immutable remote URL, compatible previous pair, backup policy, one replica, sleep disabled, and deployed flags. | CI and Git-linked deployments passed for 1c41af6; CI-gated ordered release, immutable pin and remaining provider settings pending |

## How to run the local browser regressions

Hosted checks are separate from the local mutating suite. On this authorized
simulator staging project, run `node tools/scripts/capture-staging-session.mjs`
and complete the interactive GitHub sign-in. Then run
`node tools/scripts/check-staging-authenticated.mjs --webkit` for authenticated
rendering/WSS, or `node tools/scripts/check-staging-controls.mjs` for simulator
fan/fallback/Pause/All off checks. The latter verifies hosted staging/memory/live
flags before mutations and runs All off cleanup. Install both Playwright browsers.
The cookie file and raw local results stay in ignored `.infra/`; never upload
the cookie file as a CI artifact. Committed evidence contains no session values.

For a coordinated Railway restart drill, run
`node tools/scripts/observe-staging-restart.mjs`. It verifies simulator/live flags,
starts simulated automations and fan activity, and prints a readiness message.
Only then restart the explicitly identified staging service with Railway CLI.
The observer requires a new controller epoch, preserved settings/revision, paused
automations, fan/pump off, and automatic browser WSS recovery without page reload.
It records sanitized results locally and executes All off cleanup. A missing
restart times out; a failed WSS recovery is recorded and exits nonzero.

```text
node tools/scripts/run-e2e-test.mjs
```

The harness uses a memory simulator and loopback services, overrides database/live
configuration, and stops the processes it starts. It requires free ports 3001, 5173,
and 5174 and the installed Playwright Chromium browser. Tests run serially against
the shared farm. Recovery tests reset settings and outputs before/after each case.
The suite rejects a hosted `E2E_HOST_URL`; do not use it to exercise cloud or hardware.

Two browser contexts have separate local sessions. This proves browser concurrency,
not real GitHub identity/role provisioning or PostgreSQL durability. Those require
the hosted checks and PostgreSQL integration tests above.

## Remaining release work

1. Fill the exact current and previous compatible deployment mapping.
2. Complete authenticated hosted browser checks and provider recovery drills.
3. Implement section 16's CI-gated staging deployment flow and immutable remote pinning
   with the actual authorized project IDs and deployment access.
4. Attach sanitized results and measurements, then review every S01–S14 row.

Only mark G08 passed when all required hosted observations exist. P14 starts with
production read-only and a dedicated backend MQTT credential; hardware pumping
remains subject to G09.

## Observations on 2026-09-21

Read-only public smoke at `2026-09-21T07:39:06.307Z`:

- API returned 200, staging/memory simulator, both live flags false, DB/OAuth
  configured, but **controller `waiting_for_owner`**. This is a failing staging
  qualification result, even though HTTP readiness works.
- Anonymous session through the host proxy passed: unauthenticated, local login
  disabled, response `no-store`.
- Fresh Chromium context on the host login origin imported the actual federation
  container and editor with nine remote assets. JS/CSS content types and CORS
  passed, contract major was 1, missing asset returned 404.
- Remote metadata had an empty release SHA and the URL was the mutable project
  alias. Authenticated rendering and immutable artifact identity remain pending.

Reproduce these read-only checks with `npm run check:staging-public`. A nonzero
exit means at least one public check failed. Even a successful run does not pass
the authenticated/recovery/immutable-release rows above.

The local PostgreSQL handover regression reproduced a waiting controller that
never retried after the old owner closed. The implementation now retries once
per second, reloads settings/runtime under the acquired lock, remains paused,
and prevents waiting instances from writing runtime/history. This is a plausible
explanation of the hosted symptom, not a diagnosis from Railway logs. Deploy and
repeat S06/S10 to verify the hosted fix.

## Deployed follow-up on 2026-09-21

Commit `1c41af6cf605de8e7578292993e1b1c48b66372a` was pushed and all GitHub CI
jobs passed in [run 35575055409](https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35575055409).
GitHub deployment records show successful Railway API and both Vercel deployments.
At `2026-09-21T07:56:27.187Z`, the read-only smoke reported **controller owner**
and all four public checks passed. Both live flags remained false.

The immutable Vercel deployment URLs recorded in the release mapping each return
302 without authentication. The remote candidate therefore cannot yet replace
the public alias in the host. Provider access is needed to configure approved
public immutable assets and to perform restart/rollback/backup recovery drills.
G08 is still pending; the immediate waiting-controller incident is resolved.

## Reproduce container shutdown

Shutdown/release-identity commit `a355e207aa3aaeeee64a0bac71b2acf2c2079473`
passed all four jobs in [CI run 35587182640](https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35587182640),
including the Linux process-signal test. Observed successful deployments:

- Railway: `db52457d-24e8-4f7e-8424-37ce8fdb59b4`.
- Host Vercel: `Bhg7MqnvqEdXRkinutBXcYuRLytJ`.
- Remote Vercel: `F28r9wP54WTH3XpFsXL6nRGYmdt9`.

At `2026-09-21T10:11:38.456Z`, public smoke passed with controller owner,
live flags false, and API/remote release identities matching that commit.
This observation still uses the mutable remote alias and does not complete G08.

```text
docker build -t smartfarm-g08-shutdown:local .
npm run test:container-shutdown
```

This starts one network-isolated simulator container with both live flags false,
checks readiness, delivers Docker's SIGTERM, requires exit 0 and the completion log
within 15 seconds, then removes only the container it created. The September 21
run completed in 424 ms. The PostgreSQL two-process signal test also runs in Linux
CI; Windows deliberately skips it because Windows termination does not implement
Unix SIGTERM handlers.

API release identity comes from `RELEASE_SHA` or `RAILWAY_GIT_COMMIT_SHA`. Frontend
build identity comes from `VITE_RELEASE_SHA` or `VERCEL_GIT_COMMIT_SHA`. Missing or
non-SHA hosted identity now fails `check:staging-public`. Set `EXPECTED_API_SHA` and
`EXPECTED_REMOTE_SHA` to additionally require exact release candidates; they may
differ when a host deliberately pins a previous compatible remote.
