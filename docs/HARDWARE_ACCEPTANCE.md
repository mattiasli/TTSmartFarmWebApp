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
- [ ] Physically verify no-echo/sensor-failure display where safely inducible (plan section 20.1.7)

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
After choosing to perform the remaining sensor checks manually, the operator
explicitly reconfirmed that the tank water-level sensor works well and the
dashboard readings are correct. This confirms the sensor/display observation;
no low-tank alarm, protection-indicator transition, Beep/Silence or pump result
was reported with this confirmation.
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
- [x] Browser All off stops the active fan and LED; operator confirms normal behavior
- [x] Manual Beep audible; operator confirms button returned to normal without stuck pending/animation
- [x] Cooling hysteresis in both directions and manual takeover/resume
- [x] Low-tank alarm, silence/manual override and protection status without pumping
- [x] Master pause leaves manual fan ownership alone and releases automatic fan ownership
- [x] Closing the test browser for ten seconds leaves master enabled and fan on
- [x] Observe an independent automatic state change during browser closure (persisted LED-off command in a twelve-second no-request interval)
- [x] Night-light classification: thresholds 2800/3200 make 2559 dark and 3380/3560 bright; actual cover/uncover and motion hold verified

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
Cooling and All off completed at 09:16 UTC. At 24 degrees C, on/off settings
23/21 started the fan, 27/25 stopped it, and 26/22 held both previous states in
the hysteresis band. Manual off held despite a cooling demand; Pause preserved a
manual on, while resumed automatic control was released by Pause. The browser's
All off button stopped the active fan and LED. Seven explicit command records
reached `state_matched`; the operator confirms normal cycling and final off.
Closing the test browser for 10.234 seconds without test API polling left master
enabled and the fan on. This did not observe a new rule transition during closure.
Original settings were restored, automations paused and commands disabled at
09:17:26 UTC. Device thresholds stayed 8/10, saved app thresholds stayed 20/30.
That mismatch is recorded for later pump qualification; no guard synchronization
was requested and pumping remained disabled. Evidence:
[cooling and All off](releases/production-cooling-2026-09-22.json) and
[restored dashboard](releases/production-after-cooling-2026-09-22.json).
Lighting/motion was subsequently verified at 09:58 UTC using light thresholds
2800/3200 and an eight-second motion hold. The operator confirms covered -> LED
on, uncovered -> off, and off after stepping away while a fixed cover remained.
With other farm tabs confirmed closed, the test browser closed at 09:57:59.008.
No test API requests occurred for at least twelve seconds. Command
1e91a2cb-df46-443d-ab7f-9c72cf596bc6 was created at 09:58:04.152 and matched telemetry
at 09:58:05.120; the first later snapshot showed LED off, PIR zero, light 494 and
master still enabled. Automatic origin is inferred from the active motion rule
and absent client requests; the public event DTO does not expose the actor.

The first attempt had an unstable cover and an uncover predicate advancing before
its prompt, so it did not establish timed operator correlation. The retry used a
fixed cover and explicit prompt release. Its history check initially failed due
to an incorrect helper assumption about an actorScope field; a read-only history
lookup recovered the existing matched command without another hardware attempt.
Original script failures remain in [lighting evidence](releases/production-lighting-2026-09-22.json).
Operator confirmations and recovered records qualify the physical checks, not a
claim that those original scripts completed without errors.
Settings were restored, automations paused and commands disabled at 09:58:54 UTC.
The [restored browser](releases/production-after-lighting-2026-09-22.json) passed
with seven live snapshots, all 22 fields, disabled controls and outputs off.
At that stage low-tank alarm, beep UI and safe no-echo/failure-display checks were
outstanding, alongside pump qualification. The later alarm results are below.

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

### Manual alarm attempt (September 22)

The operator requested manual dashboard testing. On source 9a42efa, the first
manual window opened at 11:22:50 UTC with only the alarm configured, master paused
and pumping disabled. The operator subsequently confirmed Beep worked. Whether
the UI pending indicator cleared was not reported, so that checkbox remains open.
The trace observed master enabled, tank 0% and a low-tank alarm message, but this
does not establish physical warning/beep/recovery/Silence results.

The operator pressed Sync tank protection, applying the already saved 20/30 pair
to the device (previously 8/10). The helper's unchanged-threshold assertion ended
the window and also incorrectly prevented restoring the original rule toggles.
Commands were disabled, leaving the dashboard read-only and paused after restart.
A separate cleanup restored the original settings, verified all outputs off and
master paused, and disabled both live flags. The synchronized 20/30 device pair
was preserved; this is not pump qualification. The helper now permits cleanup
after an observed guard change while still forbidding changes to the saved guard
pair during restoration.

The resumed manual window opened at 11:33:22 UTC. The operator confirmed LCD
warning text and beeps about ten seconds apart at low tank, recovery stopping the
warning/beeps at 30% or above, Silence stopping beeps through a fifteen-second
observation, returning the sensor and pressing Pause. They separately confirmed
the earlier Beep button returned to normal without stuck pending or animation.
The snapshot trace corroborates low tank/protection active, recovered tank/block
cleared, manual alarm override and operator Pause. Audible timing and physical
LCD behavior remain operator observations, not inferred acknowledgements.
Original settings were restored at 11:36:19 UTC; outputs were off, master paused
and both live flags false. API deployment 4649d8b3-5415-46c2-a438-732a7e4c5350
uses the same 9a42efa source. The subsequent browser check received seven live
snapshots with all 22 fields, no page errors, disabled watering and visible guard
confirmed for the matched 20/30 pair. Evidence: [alarm checks](releases/production-alarm-2026-09-22.json)
and [restored dashboard](releases/production-after-alarm-2026-09-22.json).
Safe no-echo/failure display and pump qualification remain open.

## Pump

Leave disabled until the freeze investigation and G09 checklist in `IMPLEMENTATION_PLAN.md` §20.3 are complete.
