# SmartFarm Remote Web App

React + TypeScript + Vite + Fluent UI v9 dashboard for the existing TT SmartFarm. A persistent Node service owns MQTT and automations. The browser never talks to HiveMQ.

This folder is the application repository (`https://github.com/mattiasli/TTSmartFarmWebApp`). Keep local files here.

## Status

Admins can add independent user ID/password accounts in Settings and assign
viewer, operator or admin access. See [account administration](docs/LOCAL_ACCOUNTS.md).

The web app is implemented and deployed at [smartfarm-live.vercel.app](https://smartfarm-live.vercel.app). Local packages **P00–P12**, hosted simulator **P13/G08**, and the requested non-pump hardware checks are complete for the agreed scope. Manual outputs, cooling, lighting/motion, alarm/Beep/Silence and distance Unavailable/recovery passed. The operator confirmed pump operation and stop, requested enabled pump control, and skipped further pump qualification. Backup/restore is deferred.

See the [current release and final checklist](docs/FINAL_HANDOFF.md) for source and
deployment IDs, evidence, scope exceptions and operations. The
[staging acceptance record](docs/STAGING_ACCEPTANCE.md) covers hosted OAuth,
permissions, database outage/recovery, ownership handover, rollback and automations.

Automations run on Railway and continue when the browser closes. Backend restart
or freshness loss pauses them; use **Start** to resume explicitly. Manual pump
availability is separate from this master state. Production releases preserve
the enabled control flags through the explicit `preserve-control-flags` mode.
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
