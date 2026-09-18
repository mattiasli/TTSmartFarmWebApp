# Staging deployment (G02)

Do not put HiveMQ passwords, OAuth secrets, or `DATABASE_URL` in git. Live commands and pump stay **false**.

Known public origins for this staging pass:

- Host: `https://smartfarm-host.vercel.app`
- Automations remote: `https://smartfarm-automations.vercel.app`
- Railway project: `smartfarm-staging` (Postgres linked to `_default-service`)

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
| `PUBLIC_WS_URL` | `wss://<railway-public-host>/ws` |
| `BOOTSTRAP_ADMIN_GITHUB_ID` | `43301236` |
| `BOOTSTRAP_ADMIN_USERNAME` | `mattiasli` |
| `GITHUB_OAUTH_CLIENT_ID` | from the OAuth app |
| `GITHUB_OAUTH_CLIENT_SECRET` | from the OAuth app |

Do **not** set `HIVEMQ_*`. Do not set `FARM_MODE=live`.

`PORT` is assigned by Railway. The process listens on `0.0.0.0`. Health check path is `/health/ready`. Startup runs migrations, then seeds the bootstrap admin.

After deploy, `GET https://<railway-public-host>/health/ready` should return JSON with `farmMode: "simulator"`.

## 3. Vercel host project (`smartfarm-host`)

Root directory: `apps/dashboard`.

Environment variables (Production):

| Name | Value |
|---|---|
| `VITE_APP_ENV` | `staging` |
| `VITE_API_BASE` | `/api` |
| `VITE_AUTOMATIONS_REMOTE_URL` | `https://smartfarm-automations.vercel.app/remoteEntry.js` |
| `VITE_REALTIME_URL` | `wss://<railway-public-host>/ws` |

No `DATABASE_URL`, HiveMQ, or OAuth secret on Vercel.

After the Railway public host is known, `apps/dashboard/vercel.json` must rewrite `/api/:path*` to `https://<railway-public-host>/api/:path*` **before** the SPA fallback. Redeploy the host after that change.

## 4. Vercel remote project (`smartfarm-automations`)

Root directory: `apps/automations-remote`. No secrets. Confirm `https://smartfarm-automations.vercel.app/remoteEntry.js` returns JavaScript from a clean browser (not a Vercel login page).

## 5. Smoke (after rewrite + OAuth)

1. Open `https://smartfarm-host.vercel.app/login`.
2. Sign in with GitHub as `mattiasli`.
3. Confirm a session cookie on the host origin, snapshot JSON through `/api`, and that Pause/All off stay on the host if the editor fails.

Production HiveMQ and live pump remain out of scope until G08/G09.
