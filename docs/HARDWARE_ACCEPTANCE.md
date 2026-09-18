# Hardware acceptance

This file is a template. Fill it during a supervised window. Do not write credentials.

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
- [ ] No test commands sent while live commands are false

## Non-pump controls

- [ ] Fan, LED, backlight, beep, feeder, LCD text/status
- [ ] Master pause / browser close does not stop the server engine
- [ ] Night-light 2559 vs 3380/3560 classification

## Pump

Leave disabled until the freeze investigation and G09 checklist in `IMPLEMENTATION_PLAN.md` §20.3 are complete.
