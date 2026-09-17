# Local development

All commands run from `smartFarmRemoteWebApp/`. Nothing in this project should be created outside this folder.

## Prerequisites

- Node 24.21.0 and npm 11.19.0 (see `.node-version`)
- Docker Desktop only when you need PostgreSQL + Mosquitto (`npm run infra:up`)

Local simulator development does not need HiveMQ, Railway, or Vercel credentials.

## Commands

Run one-shot checks first, then start the servers in a terminal you leave open:

```text
npm ci
npm run test:unit
npm run test:federation
npm run dev
```

`npm run dev` is supposed to keep running. When it is ready it prints the dashboard URL. Open http://127.0.0.1:5173 in a browser. Stop the servers with Ctrl+C.

The dashboard URL is not a shell command. `test:federation` also starts temporary preview servers on 4173/4174 and should stop them when the test finishes.

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by execution policy.

The dashboard proxies `/api` to the local API.

Default `npm run dev` uses an in-memory simulated farm inside the API, so Docker is not required for sensors and controls. Optional MQTT loop:

```text
npm run broker
npm run simulator
```

Then set `SIMULATOR_TRANSPORT=mqtt` for the API. Docker Compose Postgres/Mosquitto remains the preferred integration stack when Docker Desktop is running.

Local login is loopback-only (`POST /api/v1/local/login`). The dashboard does this automatically in local mode.

## Ports

| Service | Port |
|---|---|
| Dashboard Vite | 5173 |
| Automations remote Vite | 5174 |
| API | 3001 |
| PostgreSQL | 5432 |
| Mosquitto | 1883 |

Do not kill an unknown process just to free a port. Choose another documented mapped port instead.

## Secrets

Fill `private-setup/smartfarm_setup.txt` if you want live-broker values stored locally. That file is gitignored. The simulator does not read production HiveMQ.
