# SmartFarm Remote Web App

React + TypeScript + Vite + Fluent UI v9 dashboard for the existing TT SmartFarm. A persistent Node service owns MQTT and automations. The browser never talks to HiveMQ.

This folder is the application repository (`https://github.com/mattiasli/TTSmartFarmWebApp`). Keep local files here.

## Status

Local packages **P00–P12** are in `master`. Hosted **simulator staging (G02)** was demonstrated on September 18: GitHub OAuth through Vercel `/api` to Railway, live WebSocket, dashboard UI. Live commands and pumping stay disabled. Next: remaining P13/G08 qualification, then P14 hardware (pump still off).

Recorded verified staging release: `79f128b`, with all CI checks and the ordered
API/remote/host release workflow passed. Hosted database outage/recovery, handover,
rollback, permissions, automation and latency/storage checks have evidence.
Remaining G08 work is WebKit SameSite cookie qualification; fresh WebKit OAuth
itself has passed. Backup/restore
is explicitly deferred by the user, including local logical restores.
See [staging acceptance](docs/STAGING_ACCEPTANCE.md).

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
