# Operator runbooks

Do not put broker passwords, OAuth secrets, session tokens, or database URLs in this file.

On September 22 the operator explicitly requested skipping remaining pump tests
and enabling pump control. Production now has `LIVE_COMMANDS_ENABLED=true` and
`LIVE_PUMP_ENABLED=true`. Master remains paused until the operator presses Start.
Keep tank, rain, freshness and uncertain-pump protections enforced. This operator
decision replaces the earlier blanket disablement; skipped qualification is not
a claim that all hardware tests passed.

The physical farm dashboard is https://smartfarm-live.vercel.app. The separate
https://smartfarm-host.vercel.app dashboard is simulator staging. Sign in with
an authorized GitHub account. Water briefly, Stop pump and All off are available
to permitted users while connection conditions allow them. Sensor, output and cooling
test results are recorded in [hardware acceptance](HARDWARE_ACCEPTANCE.md).

## Health

- `GET /health/live` — process is up.
- `GET /health/ready` — HTTP is ready. It does **not** wait for MQTT ownership or fresh telemetry.
- `GET /api/v1/diagnostics` — authorized snapshot of controller/MQTT age, ownership, and live flags.

If `/health/ready` is 200 but sensors are stale, the controller is not fresh. Do not infer a working pump from HTTP 202.

## Automations appear paused

Expected after every backend start, MQTT reconnect, ownership handover, or lost freshness. Start them explicitly from the host Pause/Start controls. Closing the browser does not pause healthy server automations.

Start is available only when commands are enabled and the controller has fresh
readings. Pause releases outputs owned by automation; a manually switched-on fan
can stay on. Use its manual Off control or All off to stop it. This ownership
behavior was physically verified on September 22. A subsequent lighting check
recorded a matched automatic LED-off command during twelve seconds with the test
browser closed and no test API polling. The user confirmed closing the other farm
tabs and seeing the LED turn off while the sensor remained covered. Closing a
farm tab is not a stop control. See [lighting evidence](releases/production-lighting-2026-09-22.json).

## Command result is uncertain

The MQTT publish completed or timed out without a newer matching telemetry packet. Do not retry blindly. Use Stop or All off, then inspect diagnostics. LCD text and short beeps stay `sent` (`not_reported`) even when they worked.

## Tank protection mismatch

Compare requested `tankLow`/`tankRecover` with the latest firmware echo. Pump starts stay blocked until `guard=1`, telemetry is fresh, and the echoed pair matches. Sync tank protection once for the current revision; do not resend on every packet.

On September 22 the device reported 8/10 and the app had 20/30 saved. These were
left unchanged during non-pump tests. Resolve the intended calibrated pair during
supervised pump qualification; do not change it merely to remove a pending label.
Firmware support (`guard=1`) alone does not establish matching settings.

## Rule enabled but idle

Check master pause, the individual rule toggle, current valid reading, hysteresis, manual override, cooldown/attempts, and the card reason text. Night light uses `light <= lightOn`. Cooling requires a healthy DHT reading.

## Database or ownership loss

Mutations fail closed. The controller pauses. A second process reports `waiting_for_owner` and `/health/ready` still answers. Recovery starts a new MQTT epoch and stays paused.

## Remote editor unavailable

Host sensors, Pause, and All off remain usable. Check the pinned remote URL, CORS, contract major, and child chunks. Retry the editor; do not add a user-entered remote URL.

## Credential rotation

Create the replacement secret in the provider first, update Railway (or local private setup), restart paused, confirm fresh telemetry, then revoke the old credential. Never print passwords in logs or CI.

## Backup restore drill

Explicitly deferred by the user, including provider backups and local logical
dump/restore drills. No restore test is claimed as passed. Revisit only if the
user changes that scope.
