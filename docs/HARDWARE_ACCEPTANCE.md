# Hardware acceptance

This file records supervised acceptance and remaining checks. Do not write credentials.

Preparation: the live TLS adapter is implemented. The user authorized reuse of
the existing MQTT credential for the initial read-only observation and explicitly
extended that exception to supervised non-pump tests on September 22; it has not
been reset. This is not evidence of broker-enforced read-only permissions.
Read-only production is deployed; physical acceptance remains outstanding. See
[production connection](PRODUCTION_DEPLOYMENT.md).

- Date: 2026-09-22
- Operator: user, confirming physical observations in this session
- Firmware identifier: latest sibling FanMqtt source, operator-reported; hashes below
- Backend SHA: 1c6eb418fd26e33f1cf556890a0ad0cc76bc2fa1
- Power source: USB plus another power supply (operator report); external supply ratings not recorded
- `LIVE_COMMANDS_ENABLED`: temporarily true in authorized windows, restored false
- `LIVE_PUMP_ENABLED`: false throughout

## Read-only

- [x] Desktop/Android applications stopped (user confirmation, September 21)
- [x] Fresh telemetry observed locally: 223 samples / three minutes, all 22 fields
- [x] Production OAuth, live WSS telemetry, all 22 fields and disabled controls verified on 1c6eb41
- [x] Three-minute hosted observation: 197/197 fresh snapshots, one controller epoch
- [x] User confirms latest sibling `FanMqtt` source is installed; binary not read back
- [x] Rain/steam, distance and light sensors work correctly (operator confirmation, September 22)
- [x] PIR motion and brief yellow-button response confirmed by operator (September 22)
- [x] Temperature and humidity look reasonable on the dashboard (operator confirmation, September 22)
- [x] Soil/tank readings confirmed by operator (September 22)
- [x] Several minutes of fresh telemetry observed; operator confirms sensor responses (timed recording correlation remained inconclusive)
- [x] Local read-only observation made no command publish calls; both live flags false

Evidence: [read-only observation](releases/live-readonly-2026-09-21.json).
Hosted evidence: [browser verification](releases/production-authenticated-2026-09-22.json)
and [sensor baseline](releases/production-sensors-2026-09-22.json). The baseline
included transient DHT failure values (-99/-1); physical correlation is not yet
qualified. The user reported completing light-cover and near/far distance steps,
but these did not establish a clear light response or intended distance match.
The operator subsequently confirmed that rain/steam, distance and light sensors
work correctly on September 22. This is manual operator confirmation; the earlier
recording remains inconclusive for timed stimulus correlation. The operator
subsequently confirmed motion, yellow button and soil/tank readings as correct.
Basic sensor checks are operator-confirmed. The operator also confirms that displayed
temperature and humidity look reasonable. This does not erase the brief DHT
failure readings captured earlier or establish uninterrupted sensor operation.
Command and pump flags remain false.
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

- [x] Read-only command-retention audit: no retained/live commands observed across firmware filters in 30 seconds; 37 fresh telemetry packets (September 22)
- [x] Operator confirmed supervision, power interruption access and other controllers stopped for September 22 fan test
- [x] Fan on/off: two-second request interval, both states matched telemetry; operator confirms physical run and stop
- [x] LED, backlight, short beep, feeder, two-line LCD text/status (operator confirms all five)
- [x] Maximum 16-character LCD lines displayed; five invalid text cases rejected by production API
- [ ] All-off physical behavior and beep animation during a live UI request
- [ ] Cooling hysteresis and manual takeover/resume
- [ ] Low-tank alarm, silence/manual override and protection status without pumping
- [ ] Master pause / browser close does not stop the server engine
- [ ] Night-light 2559 vs 3380/3560 classification

Audit evidence: [command retention](releases/command-retention-2026-09-22.json).
The audit subscribed to `smartfarm/cmd/#`, legacy `smartfarm/fan/set`, and telemetry,
with verified TLS. It sent no publish packets and cleared nothing. This bounded
observation does not establish that other controllers are permanently stopped.
First actuator check completed September 22 at 08:41 UTC. Fan-on and fan-off
requests were 2.002 seconds apart; both reached `state_matched`. The operator
confirmed that the physical fan ran and stopped. Commands were restored disabled
at 08:42:10 UTC; pumping remained disabled throughout. The original qualified
source SHA 1c6eb41 was redeployed for each configuration change. Evidence:
[fan test](releases/production-fan-2026-09-22.json) and
[restored dashboard](releases/production-after-fan-2026-09-22.json).
The second group completed at 08:56 UTC. The operator confirmed LED on/off,
backlight off/on, one short beep, feeder open/close, and two 16-character LCD
lines followed by status mode. All seven state-reported commands reached
`state_matched`; beep and LCD text/status correctly remained `sent/not_reported`.
The operator supplies their physical confirmation. Commands were restored false
at 08:57:15 UTC on API deployment 0f0994e1-080a-434c-bb31-e0f187b2f760.
Five invalid LCD requests (overlong line 1/2, Unicode, separator and newline)
returned HTTP 400 VALIDATION with commands disabled. A subsequent browser check
received six live WSS snapshots with all 22 fields and disabled controls, with
zero page errors. Evidence: [output tests](releases/production-outputs-2026-09-22.json)
and [restored dashboard](releases/production-after-outputs-2026-09-22.json).
All-off and physical automation checks remain outstanding. Arrange their
supervised scope before sending further actuator commands.

Tested sequence: `tools/scripts/supervised-output-sequence.mjs` supports
LED/backlight only, or LED/backlight, one short 880-Hz beep, feeder open/close,
and two 16-character LCD lines followed by status mode. It contains no provider
access or pump commands. The caller must enforce request/observation timeouts,
verify the initial outputs and paused automation state, and restore the command
flag even on failure. The sequence restores each attempted output before moving
on and stops the group after uncertainty. Beep and LCD text require physical
observation; feeder telemetry confirms the commanded state, not measured angle.
Nine local tests verify command schema compatibility, scope restrictions,
cleanup and stopping after uncertainty; actual physical evidence is linked above.

## Pump

Leave disabled until the freeze investigation and G09 checklist in `IMPLEMENTATION_PLAN.md` §20.3 are complete.
