# SmartFarm Remote Web App

React + TypeScript + Vite + Fluent UI v9 dashboard for the existing TT SmartFarm. A persistent Node service owns MQTT and automations. The browser never talks to HiveMQ.

This folder is the application repository (`https://github.com/mattiasli/TTSmartFarmWebApp`). Keep local files here.

## Status

Local packages **P00–P12** are in `master`. Hosted simulator staging **P13/G08** is qualified for the agreed scope, with backup/restore deferred. GitHub OAuth through Vercel `/api` to Railway, live WebSocket and dashboard UI work. P14 has verified manual outputs, cooling/manual takeover/Pause, All off, lighting and motion hold, including an automatic change with the browser closed. Alarm, remaining display checks and pump qualification are open. Live commands are restored disabled; pumping remains disabled.

Recorded verified staging release: `d4c956d`, with all CI checks and the ordered
API/remote/host release workflow passed. Hosted database outage/recovery, handover,
rollback, permissions, automation and latency/storage checks have evidence.
G08 is qualified for the agreed scope: fresh WebKit OAuth and original-response
cookie attributes passed on September 21. P14 read-only production is deployed; supervised physical acceptance remains. Backup/restore
is explicitly deferred by the user, including local logical restores.
See [staging acceptance](docs/STAGING_ACCEPTANCE.md).

P14 progress: the real broker delivered 223 valid samples with all 22 telemetry
fields over a three-minute read-only observation. No commands were published.
Read-only production is deployed at [smartfarm-live.vercel.app](https://smartfarm-live.vercel.app)
on `d4c956d`. The original GitHub sign-in qualified OAuth; the current release
passed authenticated live WebSocket, all 22 fields and disabled-control checks
using that valid session. Guard confirmation now requires matching device/app
thresholds. Supervised hardware checks remain.
See [production setup](docs/PRODUCTION_DEPLOYMENT.md).

See `IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_PROGRESS.md` (handoff at the top), and `docs/DEPLOYMENT.md`.

## Layout

- `apps/dashboard` — federation host
- `apps/automations-remote` — federated automation editor
- `apps/api` — Fastify API, WebSocket, MQTT controller
- `packages/contracts` — runtime schemas
- `packages/domain` — protocol and automation rules
- `packages/ui` — Fluent theme
- `tools/simulator` — firmware-shaped simulator

## Quick start

```text
npm ci
npm run test:unit
npm run build
npm run dev
```

`npm run dev` stays running. Open http://127.0.0.1:5173 when it prints that the servers are ready. Press Ctrl+C to stop.

Details: [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md). Staging: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Runbooks: [docs/RUNBOOKS.md](docs/RUNBOOKS.md). Contracts: [docs/CONTRACTS.md](docs/CONTRACTS.md). CI: [docs/RELEASE.md](docs/RELEASE.md).
