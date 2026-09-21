# Implementation progress

Do not write secrets, broker passwords, OAuth client secrets, session tokens, or database URLs into this file.

## Current handoff (2026-09-21, committed and deployed)

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
