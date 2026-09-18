# Operator runbooks

Do not put broker passwords, OAuth secrets, session tokens, or database URLs in this file.

Live commands stay disabled (`LIVE_COMMANDS_ENABLED=false`) until a supervised hardware window. Live pumping stays disabled (`LIVE_PUMP_ENABLED=false`) until G09.

## Health

- `GET /health/live` — process is up.
- `GET /health/ready` — HTTP is ready. It does **not** wait for MQTT ownership or fresh telemetry.
- `GET /api/v1/diagnostics` — authorized snapshot of controller/MQTT age, ownership, and live flags.

If `/health/ready` is 200 but sensors are stale, the controller is not fresh. Do not infer a working pump from HTTP 202.

## Automations appear paused

Expected after every backend start, MQTT reconnect, ownership handover, or lost freshness. Start them explicitly from the host Pause/Start controls. Closing the browser does not pause healthy server automations.

## Command result is uncertain

The MQTT publish completed or timed out without a newer matching telemetry packet. Do not retry blindly. Use Stop or All off, then inspect diagnostics. LCD text and short beeps stay `sent` (`not_reported`) even when they worked.

## Tank protection mismatch

Compare requested `tankLow`/`tankRecover` with the latest firmware echo. Pump starts stay blocked until `guard=1`, telemetry is fresh, and the echoed pair matches. Sync tank protection once for the current revision; do not resend on every packet.

## Rule enabled but idle

Check master pause, the individual rule toggle, current valid reading, hysteresis, manual override, cooldown/attempts, and the card reason text. Night light uses `light <= lightOn`. Cooling requires a healthy DHT reading.

## Database or ownership loss

Mutations fail closed. The controller pauses. A second process reports `waiting_for_owner` and `/health/ready` still answers. Recovery starts a new MQTT epoch and stays paused.

## Remote editor unavailable

Host sensors, Pause, and All off remain usable. Check the pinned remote URL, CORS, contract major, and child chunks. Retry the editor; do not add a user-entered remote URL.

## Credential rotation

Create the replacement secret in the provider first, update Railway (or local private setup), restart paused, confirm fresh telemetry, then revoke the old credential. Never print passwords in logs or CI.

## Backup restore drill

Restore into an isolated database, start with live flags false, verify schema/users/settings, keep automations paused, and revoke restored sessions rather than reusing them.
