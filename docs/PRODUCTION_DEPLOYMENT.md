# P14 production connection

Status: preparation only. G08 simulator qualification is recorded in
[staging acceptance](STAGING_ACCEPTANCE.md), with backup/restore explicitly
deferred. No physical connection or hardware acceptance is claimed.

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
configuration, with a distinct farm ID. Record actual service IDs, source SHA,
host/remote pin and URLs after provisioning; production is not yet provisioned.
Adapt the qualified ordered release procedure deliberately; the staging runner
must continue rejecting live services.

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
