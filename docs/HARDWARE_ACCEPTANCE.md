# Hardware acceptance

This file is a template. Fill it during a supervised window. Do not write credentials.

Preparation: the live TLS adapter is implemented. The user authorized reuse of
the existing MQTT credential for the initial read-only observation; it has not
been reset. This is not evidence of broker-enforced read-only permissions.
Production provisioning and physical acceptance remain outstanding. See
[production connection](PRODUCTION_DEPLOYMENT.md).

- Date:
- Operator:
- Firmware identifier:
- Backend SHA:
- Power source:
- `LIVE_COMMANDS_ENABLED`:
- `LIVE_PUMP_ENABLED`:

## Read-only

- [x] Desktop/Android applications stopped (user confirmation, September 21)
- [x] Fresh telemetry observed locally: 223 samples / three minutes, all 22 fields
- [x] User confirms latest sibling `FanMqtt` source is installed; binary not read back
- [ ] Several minutes of telemetry correlated with supervised sensor stimuli
- [x] Local read-only observation made no command publish calls; both live flags false

Evidence: [read-only observation](releases/live-readonly-2026-09-21.json).
Source hashes taken September 21 (operator-reported installed source):

| File | SHA-256 |
|---|---|
| `FanMqtt.ino` | `87fdcb98a93aaa3d9a07647f0003e2ddec0a8c9e29aaef1d31f560fbffc397d8` |
| `PumpProtection.h` | `a6984edb726419190b1499f8da580435b6283678abe4f8e34a447f2b29584d08` |
| `MqttLink.cpp` | `796e34220cde4825f18f7019b227c6062cd586908ea062e61f9076f6dbc470c8` |

Record observed fields: `t`, `h`, `dht`, `soil`, `water`, `light`, `steam`, `rain`,
`dist`, `pir`, `btn`, `rssi`, `fan`, `led`, `feed`, `pump`, `buzz`, `bl`, `guard`,
`tankLow`, `tankRecover`, `pumpBlocked`. Record missing/invalid fields explicitly.

## Non-pump controls

- [ ] Fan, LED, backlight, beep, feeder, LCD text/status
- [ ] Master pause / browser close does not stop the server engine
- [ ] Night-light 2559 vs 3380/3560 classification

## Pump

Leave disabled until the freeze investigation and G09 checklist in `IMPLEMENTATION_PLAN.md` §20.3 are complete.
