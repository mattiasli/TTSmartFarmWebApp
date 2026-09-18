# Contracts and API surface

Generated from `packages/contracts` and `apps/api/src/app.ts`. No secrets.

## Federation

- Host: `smartfarm_host`
- Remote: `smartfarm_automations` exposing `./AutomationPanel`
- Contract major: `1` (`FEDERATION_CONTRACT_MAJOR`)
- Local remote entry: `http://127.0.0.1:5174/remoteEntry.js` (preview `4174`)
- Remote `base: './'`; host pins `VITE_AUTOMATIONS_REMOTE_URL`

The remote receives props and callbacks only. It must not open MQTT, WebSockets, or API URLs of its own.

## HTTP

| Method | Path | Notes |
|---|---|---|
| GET | `/health/live` | Process up. |
| GET | `/health/ready` | HTTP ready; not farm-fresh. |
| GET | `/api/v1/session` | Cookie session. |
| POST | `/api/v1/local/login` | Loopback local operator only. |
| POST | `/api/v1/logout` | Revokes cookie and sockets. |
| GET | `/api/v1/farms/:farmId/snapshot` | Authorized snapshot. |
| POST | `/api/v1/farms/:farmId/commands` | Idempotent; CSRF + Origin. |
| GET | `/api/v1/farms/:farmId/commands/:commandId` | Current command record. |
| POST | `/api/v1/farms/:farmId/automations/start\|pause` | Master control. |
| PUT | `/api/v1/farms/:farmId/automations/settings` | `If-Match` revision. |
| GET | `/api/v1/farms/:farmId/history` | Bounded series window. |
| GET | `/api/v1/farms/:farmId/events` | Cursor page. |
| POST | `/api/v1/realtime/tickets` | Single-use WS ticket. |
| GET | `/ws` | First frame must authenticate. |

History series: `t`, `h`, `soil`, `water`, `light`, `steam`, `dist`, `rssi`. Windows cannot exceed 30 days or 2000 buckets.

## Realtime envelope

`protocolVersion`, `farmId`, `serverEpoch`, `sequence`, `sentAt`, `type`, `data`. Types: `snapshot`, `telemetry`, `command`, `automation`, `connection`, `event`.

## Safety flags

`LIVE_COMMANDS_ENABLED` and `LIVE_PUMP_ENABLED` default false. Production cannot run `FARM_MODE=simulator`.
