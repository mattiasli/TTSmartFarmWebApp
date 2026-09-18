# Implementation progress

Do not write secrets, broker passwords, OAuth client secrets, session tokens, or database URLs into this file.

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
