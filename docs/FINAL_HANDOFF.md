# Production handoff and acceptance review

Review date: September 22, 2026. This file summarizes current delivery against
implementation plan section 22. It does not replace the original observations,
source-level assertions or the operator's explicit scope decisions.

## Current release

- Physical farm/password sign-in: https://ttsmartfarm.mattias.li
- Registered GitHub sign-in origin: https://smartfarm-live.vercel.app
- Simulator staging: https://smartfarm-host.vercel.app
- Production API: https://smartfarm-api-production.up.railway.app
- Deployed application source: b26f67bbe1a907ad0a3051bbfd46bf10c2bfa92e.
  [Release manifest](releases/production-b26f67b.json).
- CI [35737107748](https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35737107748),
  staging [35737539519](https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35737539519)
  and production [35738228290](https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35738228290) passed.
- [Account administration](LOCAL_ACCOUNTS.md) supports independent user IDs/passwords,
  roles, password resets and removal. Settings now separates members and account creation.
- [Custom-domain account checks](releases/production-b26f67b-accounts.json) passed
  actual Chromium/WebKit login and live updates, role enforcement, CSRF-protected
  administration, cookie attributes, revocation and responsive Settings. Temporary
  accounts were removed. No actuator commands were sent.
- [Control verification](releases/production-b26f67b-controls.json) confirms enabled
  live flags and pump permission. [Maintenance](releases/production-b26f67b-maintenance.json)
  paused automations before deployment. At final verification they were running;
  verification preserved that state. The first post-release check stopped on its
  paused-state assumption; the subsequent read-only check observed the current
  running state and passed without changing it.

## Scope decisions that must survive handoff

1. Backup/restore was explicitly deferred, including local logical restore.
   No backup or restore pass is claimed.
2. The operator explicitly skipped remaining pump tests and requested leaving
   pump control enabled. They independently pressed Water briefly and confirmed
   that it stopped and works. This is not full pump/power/freeze qualification.
3. Existing MQTT credential reuse was authorized. It is shared with the device;
   broker-enforced least privilege is not claimed. Do not revoke it casually.
4. Sensor failure tests were limited to safely observable conditions. Distance
   no-echo and recovery passed; other physical failures were not induced.
5. Completed manual controls, cooling, lighting/motion, alarm and distance tests
   must not be repeated merely to satisfy a new implementer's workflow.

## Final checklist review (plan 22.1, in original order)

| # | Requirement | Evidence and disposition |
|---|---|---|
| 1 | React/TypeScript/Vite/Fluent host; desktop/mobile; no 3D | Host/remote workspaces and CI builds; [production responsive checks](releases/production-responsive-2026-09-22.json) cover 390px Chromium/WebKit and 1440px Chromium, live socket, stable navigation, visible controls and no horizontal overflow. The frontend import boundary is checked in CI. |
| 2 | All 22 telemetry fields, units, validity and staleness | `packages/contracts/src/telemetry.ts`, domain parsing/normalization/freshness tests; [live browser](releases/production-after-alarm-2026-09-22.json) accounts for all 22 fields; [failure display](releases/production-failure-displays-2026-09-22.json) and operator sensor observations. DHT physical failure was not forced. |
| 3 | Manual controls and truthful status | Controller command tests distinguish sent/not_reported from state_matched; [hardware record](HARDWARE_ACCEPTANCE.md) links fan, outputs, All off, LCD and Beep/Silence observations. Pump operation was operator-confirmed after explicit test waiver; broader pump tests were skipped. |
| 4 | Five server automations, thresholds, takeover/resume | `packages/domain/src/engine.test.ts`, actual MQTT/Postgres automation integration tests, and hosted S03 in [G08 record](STAGING_ACCEPTANCE.md). Physical cooling, lighting/motion and alarm passed. Physical irrigation qualification was skipped. |
| 5 | Slider reset and night-light regressions | `packages/domain/src/draft.test.ts`, settings/classification tests, local `tests/e2e/recovery.spec.ts`, hosted S05 concurrency and [physical lighting](releases/production-lighting-2026-09-22.json). |
| 6 | Persistent MQTT only on Railway | `apps/api/src/farm-link.ts`, deployment config and live transport/ownership observations. Host calls HTTP/WSS only; the remote uses host callbacks. CI frontend-import checks enforce the package boundary. |
| 7 | Secrets excluded from frontend/source/response/log paths | CI deploy secrets are isolated from validation/PR jobs; frontend artifact/import scans, private-setup ignore rules and auth/redaction tests. Providers hold credentials; committed evidence excludes session/credential values. Automated scans are checks of known paths/patterns, not a promise against every possible future leak. |
| 8 | Hosted OAuth/session/CSRF/roles/tickets/expiry/revocation | Hosted S02/S07 evidence includes fresh WebKit original-response cookie attributes and distinct-user revocation; Postgres auth integration tests cover durable paths. [Current access audit](releases/handoff-access-2026-09-22.json): only mattiasli admin in production and staging, no temporary test member remains. |
| 9 | Pinned remote and usable host on remote failure | Immutable release manifests; actual built federation checks and hosted S01/S04; local remote failure/retry tests verify Pause/All off remain available. |
| 10 | No replay or automatic irrigation resume after loss/restart | Postgres command-restart, MQTT loss and process-shutdown integration assertions; hosted S06/S08/S09/S10/S11. Physical pump interruption tests were explicitly skipped. |
| 11 | Guard confirmation requires device echo | Domain guard tests and deployed correction; operator Sync tank protection applied 20/30, matched in telemetry and visible confirmed in [after-alarm browser](releases/production-after-alarm-2026-09-22.json). |
| 12 | Ownership/drain/deploy overlap without readiness deadlock | Postgres controller-lock and outage integration tests; hosted S08/S10 includes waiting-owner HTTP readiness, old-owner drain and paused new owner. |
| 13 | Isolated CI and gated release authority | `.github/workflows/smartfarm-web-ci.yml`, staging and production workflows; exact-source checks; hosted S14. The preserve-control-flags mode passed exact-source CI, staging and production qualification; both flags remained true. |
| 14 | Backup, restore, retention, rollback | Backup/restore deferred by user. Retention implementation and actual DB size/deletion tests passed; hosted S11 rollback/restore of compatible API/host/remote pairs passed. Release manifests retain concrete versions and deployment IDs. |
| 15 | Physical acceptance; unresolved pump issue means disabled | Non-pump acceptance is recorded. The operator explicitly overrode the blanket pump-disable requirement, skipped pump qualification and requested enabled control. Last stale pump-on report recovered to fresh pump-off; operator confirmed physical stop. The prior freeze is not claimed resolved by this project. |
| 16 | Existing firmware/desktop/Android work preserved | Changes are in this web repository. Rechecked FanMqtt.ino, PumpProtection.h and MqttLink.cpp SHA-256 values match the pre-implementation hashes in HARDWARE_ACCEPTANCE.md. No firmware upload or electrical modification was performed. Installed binary identity remains operator-reported. |
| 17 | Sufficient README/setup/deploy/ops/progress handoff | README, LOCAL_DEVELOPMENT/DEPLOYMENT/PRODUCTION_DEPLOYMENT/RUNBOOKS/CONTRACTS/RELEASE and IMPLEMENTATION_PROGRESS provide setup, targets, authority, failure handling and evidence. This review records current scope rather than treating old progress entries as current instructions. |
| 18 | Honest release notes and limitations | Original failed lighting/alarm helper attempts remain documented; later recovery is distinguished from their failures. Deferred/skipped hardware/backup work, shared credential and protocol limitations are explicit. |

## Gates and deployment operations

G00–G07 implementation evidence is retained in the progress chronology, source
tests and CI. G08 is qualified for the agreed scope (backup/restore deferred),
with procedure-by-procedure evidence in STAGING_ACCEPTANCE.md. G09's requested
non-pump/manual scope is recorded; the original full pump gate was not passed
and is explicitly waived by the operator's later instruction. G10 handoff is complete for the agreed scope: the production workflow passed,
the release mapping and authenticated checks are recorded above, and all 18
requirements have evidence or explicit limitations. This is not an unqualified
pass of the original backup/restore or full pump hardware requirements.

Use production workflow `control_mode=preserve-control-flags` for the enabled
farm. It snapshots/validates existing flags and never writes them. Read-only is
still the default mode and correctly refuses enabled flags. The legacy script,
artifact and feature-toggle names contain `readonly` for compatibility; inspect
manifest scope/controlFlags for the actual mode. Keep a maintenance interval:
pause automations, confirm the pump stopped, deploy the exact CI/staging-qualified
SHA, and verify the new owner plus enabled manual permissions. Backend startup
stays paused; the operator explicitly resumes when ready.

For rollback, use a schema-compatible API and its recorded host/remote pair.
The 247b525 manifest provides the pre-local-account API/frontend pair; its UI lacks password login/management, so retain GitHub admin access for that rollback path. The additive account tables remain in place; older
manifests retain prior pairs. Preserve current control flags and leave master
paused. Never restore old command intent or infer a physical stop from a provider
success status. See RELEASE.md and RUNBOOKS.md for the tested staging procedure.

Railway logs/metrics and application diagnostics are the current monitoring
surface; no external alerting service or paid backup configuration is claimed.
Check telemetry freshness separately from API health and broker connection.
The operator may start automations during normal use, so recorded snapshots are
observations at their timestamps rather than persistent promises of paused state.

## Known protocol limits

The firmware has no per-command acknowledgement. Telemetry may miss brief beeps
or pulses; feeder telemetry reports a commanded position, not measured movement.
The backend best-effort stop and firmware pulse cap depend on functioning
software, hardware and connectivity. No unlimited pump-on mode was added, and
tank/rain/freshness/uncertain-state protections remain enforced. No further pump
tests are authorized by this handoff.
