# P14 production connection

Status: read-only production deployed at https://smartfarm-live.vercel.app on
afc31b1; CI, staging and production release passed. See
[release evidence](releases/production-afc31b1.json). Fresh authenticated browser
verification and supervised physical acceptance remain separate checks.
G08 simulator qualification is recorded in
[staging acceptance](STAGING_ACCEPTANCE.md), with backup/restore explicitly
deferred. Supervised physical acceptance is not yet complete.

The backend selects authenticated TLS MQTT when `FARM_MODE=live`, never the
memory simulator. Simulator staging rejects the live adapter.

## Required access

The private setup credential matched the existing device credential on September
21. At the user's request, reuse it for the initial read-only connection without
changing or resetting it. This is an exception to the plan's dedicated-principal
requirement for this initial connection. Read-only enforcement is in the app;
the shared credential is not claimed to have a broker-enforced publish denial.
Save values only in ignored private setup and production backend secret variables,
never Vercel or GitHub CI. Actual permissions still need verification.

Before enabling commands, coordinate desktop/Android controller cutover and the
retained-command audit with the physical operator. Do not clear retained topics
without that audit.

## Isolated read-only deployment

Keep simulator staging intact. Provision a separate live API, database and host
configuration, with a distinct farm ID. Projects/services are provisioned;
record the source SHA and immutable host/remote mapping after deployment.
Adapt the qualified ordered release procedure deliberately; the staging runner
must continue rejecting live services.

The production projects and domains are now reserved; actual IDs are recorded in
`tools/deploy/production.json`. The API has its separate database reference and
both live flags false and is deployed. Its OAuth app uses
homepage `https://smartfarm-live.vercel.app` and redirect URI
`https://smartfarm-live.vercel.app/api/auth/github/callback`. Disable wildcard
matching and device flow; leave user access token expiration enabled. GitHub's
token is used during sign-in; SmartFarm subsequently uses its own session.

The user has added both OAuth values to the production API; presence is verified.
The manual `smartfarm-web-production` workflow requires successful CI and a
successful coordinated staging release for the same SHA. Its initial scope is
strictly read-only: provider settings and running health must both have live
commands and pumping disabled. It verifies candidate/stable public login and
proxy delivery, then explicitly leaves fresh OAuth and authenticated live
telemetry for the first operator session. It does not mark G09/G10 passed.

Deployment secrets belong to GitHub environment `smartfarm-production`:
`RAILWAY_TOKEN`, `VERCEL_HOST_TOKEN`, `VERCEL_REMOTE_TOKEN`, and
`VERCEL_HOST_AUTOMATION_BYPASS`. All four secret names are verified after the
user added the deployment tokens; the successful production deployment verified
their validity. `PRODUCTION_READONLY_RELEASE_ENABLED=true` after successful CI
and exact staging qualification. Broker and OAuth credentials stay in Railway.

| Backend setting | Initial live value |
|---|---|
| `APP_ENV`, `FARM_MODE` | `production`, `live` |
| `LIVE_COMMANDS_ENABLED`, `LIVE_PUMP_ENABLED` | Both `false` |
| `HIVEMQ_HOST` | Existing bare cluster hostname |
| `HIVEMQ_MQTT_TLS_PORT` | `8883` |
| `HIVEMQ_USERNAME`, `HIVEMQ_PASSWORD` | Existing credential for initial read-only connection; secrets only |
| `DATABASE_URL` | Separate live database reference |
| `FARM_ID`, `FARM_NAME` | Recorded live farm identity |
| `PUBLIC_APP_ORIGIN`, `ALLOWED_BROWSER_ORIGINS` | Actual live host HTTPS origin |
| `PUBLIC_WS_URL` | Actual live API WSS URL |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | OAuth app for the live host callback |
| `BOOTSTRAP_ADMIN_GITHUB_ID`, `BOOTSTRAP_ADMIN_USERNAME` | Verified owner identity |

The adapter verifies certificate/hostname, uses a clean session, disables offline
QoS-zero queuing, rejects retained telemetry, and requires a successful telemetry
subscription. Read-only mode rejects publishing at both policy and adapter levels.
Missing credentials fail startup instead of producing simulated readings.

Use one replica, no sleeping, migrations before startup and existing ownership/drain
readiness rules. Verify actual provider settings. Backup/restore remains deferred.

## Physical qualification

Fill [hardware acceptance](HARDWARE_ACCEPTANCE.md) during a supervised window using
plan section 20. Record firmware identity and several minutes of fresh telemetry,
all 22 wire fields and guard fields; compare readings with actual sensor stimuli.
MQTT connectivity alone does not satisfy G09.

For a bounded local observation using the actual live adapter, run
`node --import tsx tools/scripts/observe-live-telemetry.mjs`. It reads ignored
private setup, forces both live flags false, observes for three minutes and saves
only sanitized counts/field names to `.infra/live-readonly-observation.json`.
It makes no publish calls and does not certify physical sensor behavior.

Only after read-only acceptance and controller cutover, grant command-topic
publishing and enable general commands for supervised non-pump tests. Keep
`LIVE_PUMP_ENABLED=false`. Investigate the prior pump freeze separately before
pump qualification or unattended irrigation.
