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
| S01 | From a logged-out browser, load the pinned remote entry and all imported JS/CSS. Verify content types, CORS, no login interstitial, and a genuine 404 for a missing chunk. Render the editor with no unexpected script errors. | Pending hosted execution |
| S02 | Sign in through the host `/api` rewrite; inspect secure HttpOnly host cookie, private/no-store responses, snapshot and authenticated WSS. Repeat in Chromium and WebKit. | Basic Chromium topology reported September 18; complete rerun pending |
| S03 | Exercise simulator manual commands and all five automations. Check reported vs pending states, guard synchronization, permissions, and continued server automation after browser closure. | Pending hosted execution |
| S04 | Block remote requests in the browser. Verify fallback, continuing sensor updates, successful host Pause, and All off stopping a simulated running output. | Local browser regression in `tests/e2e/recovery.spec.ts`; hosted pending |
| S05 | Open two isolated sessions. An untouched editor follows another session's save. A dirty editor keeps its draft and shows conflict. Reload accepts saved settings; a save overtaken in transit returns 409 without overwrite. | Local browser regressions in `tests/e2e/recovery.spec.ts`; hosted OAuth identities pending |
| S06 | Start simulator automations, restart the backend, reconnect browsers. Verify new controller epoch, master paused, no command replay, settings retained, and explicit resume required. | Local lifecycle/integration coverage exists; Railway restart pending |
| S07 | Revoke a signed-in user's access with a second admin. Verify socket closure and rejected reads/writes, including after refresh. Preserve the last admin. | Pending hosted execution |
| S08 | Interrupt staging database access in a controlled window. Verify rejected mutations, no publishing after ownership loss, and paused recovery. Restore original connectivity. | Pending provider access and hosted execution |
| S09 | Exercise actual broker loss/reconnect with the isolated local MQTT suite; verify stale state, no queued replay, and explicit resume. Hosted memory transport has no broker; also exercise hosted backend/socket interruption. | Run and record local MQTT integration results; hosted network recovery pending |
| S10 | Deploy a compatible new API while the old owner drains. Record both deployment IDs, readiness while waiting for ownership, one owner, bounded drain, and paused handover. | Pending provider access and hosted execution |
| S11 | Roll back API to a schema-compatible version and host/remote as a recorded immutable pair. Verify login, assets, snapshots, paused automations, and no replay. | Pending immutable release mapping and hosted execution |
| S12 | Restore an actual staging backup into a new isolated database. Verify migrations, roles, settings revisions, events/history; revoke restored sessions; start simulator paused with live flags false. Record duration and backup age. | Pending provider backup/restore access |
| S13 | Measure normal telemetry-to-browser latency (<2 s), stale indication (~4 s plus scheduling), command acceptance (<1 s), and memory over 30 minutes. Record sample counts, percentiles, process/browser memory, row/index size and retention behavior. | Pending measurements; targets are not claimed results |
| S14 | Verify CI for the exact release SHA; coordinated deploy authority, immutable remote URL, compatible previous pair, backup policy, one replica, sleep disabled, and deployed flags. | Manual staging deploys remain; release automation pending |

## How to run the local browser regressions

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
