# P14 production connection

Status: read-only production deployed at https://smartfarm-live.vercel.app on
d4c956d; CI 35710019685, staging 35710305487 and production 35710809568 passed. See
[release evidence](releases/production-d4c956d.json). Fresh OAuth was qualified
on the earlier same-day release; the valid app session verified the new release's
live WebSocket, all 22 fields, disabled controls and correct pending guard status:
[browser evidence](releases/production-d4c956d-browser.json).
Supervised physical acceptance remains incomplete.
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
On September 22 the user explicitly extended reuse to the supervised two-second
fan test. Both fan states matched telemetry and the operator confirmed run/stop.
Commands were restored disabled; pumping remained disabled. See
[fan evidence](releases/production-fan-2026-09-22.json). A separately authorized
LED/backlight/beep/feeder/LCD group also passed on September 22, with operator
confirmation, seven matched states and commands restored false at 08:57 UTC:
[output evidence](releases/production-outputs-2026-09-22.json). Production API
deployment is now 0f0994e1-080a-434c-bb31-e0f187b2f760 on the same source SHA.
Further actuator tests require their own supervised scope.

Cooling/manual takeover/Pause and browser All off also passed at 09:16 UTC:
[cooling evidence](releases/production-cooling-2026-09-22.json). Settings were
restored and commands disabled at 09:17:26 UTC on deployment
71875f4a-2e91-4990-9e9a-ce1efeb3e3be, same source 1c6eb41. The observed device
guard thresholds 8/10 differ from saved app settings 20/30; neither was changed.
Resolve and supervise matching guard settings as part of pump qualification.

The subsequent read-only d4c956d release fixes guard confirmation to require
matching device/app thresholds. That release initially used API deployment:
f37fc3b9-688d-4b84-8837-c6c9548ed114. The frontend visibly reports guard pending for
the existing mismatch. This release does not change either threshold pair.

Later supervised lighting/motion checks used the same d4c956d source. Settings
were restored and commands disabled at 09:58:54 UTC on current API deployment
ddb5b48f-ae0f-44e3-bda5-11b71212c599. A persisted, matched LED-off command occurred
inside the verified closed-browser/no-request interval, and the operator confirmed
the physical result. See [lighting evidence](releases/production-lighting-2026-09-22.json)
and [restored browser](releases/production-after-lighting-2026-09-22.json).
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
