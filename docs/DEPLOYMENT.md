# Staging deployment (G02)

Current qualification work: [P13 acceptance report](STAGING_ACCEPTANCE.md).
The current release mapping is in [releases/staging.json](releases/staging.json).
Release `f7d36d9` passed required CI and deployed to all three services. Hosted S03
manual commands and all five automations passed. The host uses the anonymously
accessible immutable `9abcf36` remote; its protection and asset checks are recorded
in the acceptance report. G08 remains pending the outstanding hosted drills.
Backup/restore (S12), including logical dump/local restore, is explicitly deferred
by the user; no paid backup feature or upgrade should be enabled for this work.
The September 18 observations below are historical.

Do not put HiveMQ passwords, OAuth secrets, or `DATABASE_URL` in git. Live commands and pump stay **false**.

Known public origins for this staging pass:

- Host: `https://smartfarm-host.vercel.app`
- Automations remote: `https://smartfarm-automations.vercel.app`
- Railway project: `smartfarm-staging` (Postgres linked to `_default-service`)
- Railway API: `https://default-service-production.up.railway.app`

## 1. GitHub OAuth app

[Register a new OAuth app](https://github.com/settings/developers)

| Field | Value |
|---|---|
| Application name | `TT SmartFarm staging` |
| Homepage URL | `https://smartfarm-host.vercel.app` |
| Application description | empty |
| Authorization callback URL | `https://smartfarm-host.vercel.app/api/auth/github/callback` |
| Allow wildcard matching | off |
| Enable Device Flow | off |

Register. Copy **Client ID** into Railway. Generate **Client secret** and put it only in Railway. Do not paste the secret into chat, Vercel, or git.

## 2. Railway `_default-service`

Connect this GitHub repo (`mattiasli/TTSmartFarmWebApp`), branch `master`, root of the repo (Dockerfile lives at the repository root). Disable sleeping/serverless. Keep one replica.

Settings → Networking → generate a **public HTTPS domain**. You will need that host for `PUBLIC_WS_URL` and the Vercel `/api` rewrite. Example shape: `https://<something>.up.railway.app`.

Variables (in addition to the existing `DATABASE_URL` reference):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_ENV` | `staging` |
| `FARM_MODE` | `simulator` |
| `SIMULATOR_TRANSPORT` | `memory` |
| `LIVE_COMMANDS_ENABLED` | `false` |
| `LIVE_PUMP_ENABLED` | `false` |
| `PUBLIC_APP_ORIGIN` | `https://smartfarm-host.vercel.app` |
| `ALLOWED_BROWSER_ORIGINS` | `https://smartfarm-host.vercel.app` |
| `PUBLIC_WS_URL` | `wss://default-service-production.up.railway.app/ws` |
| `BOOTSTRAP_ADMIN_GITHUB_ID` | `43301236` |
| `BOOTSTRAP_ADMIN_USERNAME` | `mattiasli` |
| `GITHUB_OAUTH_CLIENT_ID` | from the OAuth app |
| `GITHUB_OAUTH_CLIENT_SECRET` | from the OAuth app |

Do **not** set `HIVEMQ_*`. Do not set `FARM_MODE=live`. Do **not** copy `VITE_*` suggested variables onto Railway.

`APP_ENV` must be `staging` (not `production`) while `FARM_MODE=simulator`.

This staging service currently sets `PORT=3001` so it matches the public domain **target port 3001**. If Railway’s `PORT` and the Networking target port differ, `/health/ready` returns “Application failed to respond” even when the deployment is Active. The process listens on `0.0.0.0` and `process.env.PORT`. Health check path is `/health/ready`. Startup runs migrations, then seeds the bootstrap admin.

Observed 2026-09-18: `GET https://default-service-production.up.railway.app/health/ready` returned JSON with `status: ready`, `farmMode: simulator`, `liveCommandsEnabled: false`, `livePumpEnabled: false`, `databaseConfigured: true`, `githubOAuthConfigured: true`.

## 3. Vercel host project (`smartfarm-host`)

Root directory: `apps/dashboard`.

Environment variables (Production):

| Name | Value |
|---|---|
| `VITE_APP_ENV` | `staging` |
| `VITE_API_BASE` | `/api` |
| `VITE_AUTOMATIONS_REMOTE_URL` | `https://smartfarm-automations.vercel.app/remoteEntry.js` |
| `VITE_REALTIME_URL` | `wss://default-service-production.up.railway.app/ws` |

No `DATABASE_URL`, HiveMQ, or OAuth secret on Vercel. If those were pasted onto the host by mistake, delete them from Vercel; they belong on Railway only.

`VITE_*` variables must be Vercel type **Config**, not **Secret**. A Secret `VITE_` cannot be saved or converted; delete it and recreate as Config. After changing `VITE_*`, Redeploy from Deployments → latest → ⋯ → Redeploy (values are baked at build time).

`apps/dashboard/vercel.json` rewrites `/api/:path*` to `https://default-service-production.up.railway.app/api/:path*` **before** the SPA fallback.

## 4. Vercel remote project (`smartfarm-automations`)

Root directory: `apps/automations-remote`. No secrets. Confirm `https://smartfarm-automations.vercel.app/remoteEntry.js` returns JavaScript from a clean browser (not a Vercel login page).

## 5. Smoke (after rewrite + OAuth)

1. Open `https://smartfarm-host.vercel.app/login`.
2. Sign in with GitHub as `mattiasli`.
Observed 2026-09-18: `mattiasli` reached the dashboard at `https://smartfarm-host.vercel.app` with Simulation banner, live socket, paused automations, and host Start/Pause/All off.

3. Confirm a session cookie on the host origin, snapshot JSON through `/api`, and that Pause/All off stay on the host if the editor fails.

Production HiveMQ and live pump remain out of scope until G08/G09.
