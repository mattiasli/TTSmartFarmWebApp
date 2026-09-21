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

- [ ] Desktop/Android controllers paused
- [ ] Fresh telemetry observed (all 22 fields)
- [ ] Firmware identity confirmed on the physical device
- [ ] Several minutes of telemetry correlated with supervised sensor stimuli
- [ ] No test commands sent while live commands are false

Record observed fields: `t`, `h`, `dht`, `soil`, `water`, `light`, `steam`, `rain`,
`dist`, `pir`, `btn`, `rssi`, `fan`, `led`, `feed`, `pump`, `buzz`, `bl`, `guard`,
`tankLow`, `tankRecover`, `pumpBlocked`. Record missing/invalid fields explicitly.

## Non-pump controls

- [ ] Fan, LED, backlight, beep, feeder, LCD text/status
- [ ] Master pause / browser close does not stop the server engine
- [ ] Night-light 2559 vs 3380/3560 classification

## Pump

Leave disabled until the freeze investigation and G09 checklist in `IMPLEMENTATION_PLAN.md` §20.3 are complete.
