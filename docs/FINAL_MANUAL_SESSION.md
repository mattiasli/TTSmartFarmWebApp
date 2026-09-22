# Remaining manual acceptance session

Use https://smartfarm-live.vercel.app. Allow about 60–90 minutes once preparation
is complete. This is one checklist and one report, not a repeat of the completed
fan, LED, feeder, LCD, cooling, lighting, motion, alarm or Beep/Silence checks.

**This document does not open a command window.** Production currently has both
command flags disabled. Complete the preparation information first. We will then
arrange one attended window long enough for this checklist. You operate the
dashboard and physical kit; the implementation assistant enables the agreed
flags, records backend evidence, coordinates infrastructure interruptions and
restores the original settings/read-only mode. No automated actuator sequence.

## 0. Preparation — complete before scheduling

Record these together in the report below:

- What happened during the previous freeze: did the pump keep running, LCD
  corrupt, device restart, or telemetry disappear? What restored operation?
- Power-supply label: output voltage and current; battery type/condition if used.
  Explain what USB powers and what the other supply powers. Photograph labels
  if easier; do not change wiring or power connections while energized.
- Intended everyday power arrangement. We must check suitability against the
  actual kit/pump documentation before enabling pumping. Supply ratings alone
  do not establish suitability or resolve the freeze.
- Prior-freeze investigation: findings, any correction already made, and any
  unresolved concern about power, connections or interference. If unresolved,
  stop at the read-only checks; pump acceptance remains open.
- Tank filled, pump intake submerged, tubing secure and discharging where you
  can observe flow without flooding electronics. Never empty the tank to test a
  sensor block. Keep a way to disconnect the farm's power within reach.
- Other desktop/Android controllers and their automations closed. Identify a
  way to temporarily interrupt only the farm's Wi-Fi without moving powered
  wiring. If unavailable, mark that interruption not tested.

Before the window, the assistant records the installed-source identity, current
release/deployment, settings and controller epoch. The operator previously
reported the sibling FanMqtt firmware as installed; that is not binary readback.
Current desired and device tank thresholds are both **20/30**. Leave them unchanged
during this session unless calibration review explicitly calls for a new pair.

**Stop rule for every pump step:** if the pump has not stopped by four seconds,
or you see a freeze, reset, LCD corruption, lost control or unexpected watering,
disconnect power if needed, report the failed step and stop pump testing. Do not
send repeated pulse requests or clear an uncertain state just to continue.
The backend normally requests off after 3.5 seconds; firmware's four-second cap
depends on its loop continuing to execute. Neither is a guaranteed cutoff.

## 1. Sensor failure displays — read-only

1. Aim the ultrasonic distance sensor into open space with no nearby target.
   Watch Distance for about 20 seconds. If a genuine no-echo reading occurs, the
   app should show **Unavailable**, not -1 cm or a frozen plausible number.
2. Return a target to a measurable distance. Confirm a plausible reading returns.
3. If temperature/humidity or another sensor naturally reports failure, record
   how the dashboard represents it and whether recovery restores valid values.
   Do not unplug powered sensors or damage them to manufacture a failure.

Report no-echo not reproduced if the sensor keeps detecting objects. Report any
other failure display not tested if no safe failure can be induced. Do not count
an ordinary valid-reading test as a failure-display pass.

## 2. Tank calibration and pump starting conditions

With the actual reservoir still adequately full, move only the tank sensing area
out of water and back. Record low and recovered readings. Low should indicate
protection active; recovered should clear it. Confirm **guard confirmed**, saved
20/30 matching the device, and recovered tank at least 30%.

Check that these values correspond to a useful reserve of real water above the
pump intake. A percentage alone does not calibrate reservoir volume. If 20/30
does not provide a suitable reserve, stop for calibration review before pumping.

After preparation is accepted, the assistant enables the attended pump window
with master **paused** and all automatic rules initially off. Confirm fresh live
readings, pump Off, dry rain plate and no unresolved watering fault. The low-tank
test below is meaningful only after pumping is enabled for healthy conditions;
rejection solely because live pumping is disabled does not prove tank protection.

## 3. Manual pump pulse, stops and low-tank refusal

1. Press **Water briefly once**. Observe actual flow and time physical start/stop.
   Expect a single short pulse, normally stopped around 3.5 seconds. Observe for
   another 15 seconds: no repeat, no reset, no LCD corruption or lost telemetry.
   The assistant checks command/telemetry and backup-stop records separately.
2. With the pump confirmed Off, request one more pulse and promptly press
   **Stop pump**. Confirm physical stop and reported Off.
3. With the pump confirmed Off, request one more pulse and promptly press
   **All off**. Confirm stop and no subsequent pulse.
4. Keep the reservoir full and intake submerged. Lift only the tank sensor until
   the dashboard shows low-tank protection. Attempt **Water briefly once**:
   disabled/refused with a low-tank reason, and absolutely no pump movement.
   Return the sensor and confirm recovered readings and protection cleared.

If a stop becomes uncertain, record that further starts are blocked and end the
session's pump portion. Do not deliberately jam the pump or defeat protection to
create uncertainty. If no uncertainty occurs, mark that physical condition not
induced; simulator/backend fault tests are separate evidence.

## 4. Automatic watering, wet soil, cooldown and attempt limit

In **Automations**, enable **Water thirsty soil** and **Wait out the rain** only.
Set **Wait between pulses = 60 s**, **Maximum consecutive pulses = 2**, and
**Wait after rain clears = 20 s**. Choose **Water below soil moisture** between
the actual dry and wet probe readings; record the chosen value. Click **Apply**.
Keep the tank recovered and rain plate dry. If earlier manual stops left irrigation
in manual mode, use its **Resume automatic**. Reset watering attempts only with
the physical pump confirmed stopped and no unresolved fault.

1. Put the soil probe in the dry condition. Press **Start** and allow the initial
   60-second settling wait. Observe one short automatic pulse.
2. Immediately put the probe in a sufficiently moist sample (keep water away
   from electronics). Confirm the reading is above the chosen soil threshold.
   Wait at least 60 seconds: there must be no new pulse while the soil is wet.
3. Return the probe to the dry condition. Observe the second short pulse. Neither
   pulse may overlap or extend beyond the stop rule. The trace must show no
   repeat before cooldown expiry, independently of the wet-soil inhibition.
4. Leave it dry for at least another 60 seconds. There must be no third pulse;
   the app should show the two-attempt limit. Press **Pause**.

If wet and dry readings do not straddle a usable threshold, mark calibration
blocked rather than choosing an arbitrary value that makes the test pass.

## 5. Rain interruption and dry delay

Keep the tank recovered. With the pump Off, reset watering attempts, choose
**Maximum consecutive pulses = 1**, and apply. Leave cooldown at 60 s and dry
delay at 20 s. Resume irrigation if it is in manual mode.

1. Start with dry soil and a dry rain plate. Press **Start**. Prepare a damp swab
   to touch only the rain plate when the next automatic pulse begins.
2. Trigger rain during that pulse. Confirm the dashboard detects rain and the
   physical pump stops. If the pulse finishes before the rain reading arrives,
   record timing inconclusive, not an early-stop pass.
3. Keep the plate wet. Once the pump is confirmed Off, reset the attempt counter
   to remove the one-attempt limit as a competing block. Remain wet beyond the
   cooldown: no new pulse, with rain shown as the blocking reason.
4. Dry the plate. Watch for the 20-second dry-delay reason and no immediate
   restart. One subsequent pulse may occur only after all settling/cooldown/dry
   delays have elapsed. Then **Pause** and confirm Off.

## 6. Browser and connection interruptions

These checks stay in the same attended session. The assistant must be present
for the backend/broker maintenance steps; do not improvise provider settings or
rotate the shared MQTT credential. Each case starts with the tank recovered,
dry soil, no rain, one allowed pulse, and a confirmed stopped pump. Restore fresh
readings and explicitly re-arm between cases. Do not stack failures together.

| Case | Your action | Required observation |
|---|---|---|
| Browser closed | Start the one-pulse irrigation setup, close all farm dashboard tabs during its settling wait, and watch the physical farm. Reopen after the expected pulse. | One server-driven pulse can occur with no browser; it stops and does not repeat. Backend records must corroborate it. |
| Backend restart | At the agreed checkpoint, the assistant restarts the current API deployment during an attended active pulse. Watch the pump throughout. | Record actual stop behavior. After restart, master is paused; no pulse replay or automatic resume. If timing misses the active pulse, mark that portion inconclusive. |
| Farm Wi-Fi interruption | At the agreed checkpoint, interrupt the farm's Wi-Fi during an attended pulse without cutting farm power. Watch the pump, then restore Wi-Fi. | Record physical cutoff despite loss of backend reachability; dashboard becomes stale/offline and disallows starts. Recovery stays paused with no replay. Never rely on the network interruption itself to stop the pump. |
| Broker connection interruption | The assistant arranges a controlled backend-to-broker interruption without revoking device credentials; you observe the farm during the agreed pulse and recovery. | Record actual stop behavior, disabled starts while unavailable, explicit-resume requirement and absence of command replay. If no controlled interruption method is available, record not tested. |

Use the four-second stop rule throughout. If any interruption cannot be timed or
performed safely with this kit, leave that case open instead of repeatedly
cycling the pump. A provider/backend restart is distinct from closing a browser.

## 7. Intended normal power and finish

If the preceding pump checks used the intended everyday power arrangement,
record that. Otherwise power down first, change only to a verified suitable
normal supply arrangement, and repeat the pump checks under that arrangement.
Do not extrapolate USB-only behavior to batteries or another supply.

Press **Pause**, **Stop pump**, then **All off**. Verify physical pump and other
outputs Off. Tell the assistant **session done** (or **stop session** immediately
on a failure). The assistant disables pumping and commands, restores saved
settings, verifies paused/off/read-only state, records evidence and commits it.
Do not leave before final restoration is confirmed. Unperformed or inconclusive
checks remain open; this session does not include the explicitly deferred backups.

## One report to send here

Copy this and fill each line with PASS / FAIL / NOT TESTED plus observations.
For a failure, include time, dashboard message, physical behavior and recovery.
Never include credentials.

```text
Preparation: previous freeze / findings / correction / unresolved concerns:
Power labels and what each supply powers:
Intended normal power; actual test power:
1. No echo -> Unavailable -> valid distance:
1. Other safely observed sensor failure/recovery (or not induced):
2. Tank low/recovered readings; adequate physical reserve; guard pair:
3. Single pulse: approximate duration / actual flow / stability / no repeat:
3. Stop pump:
3. All off:
3. Low-tank refused start with pump intake still submerged:
3. Uncertain stop (or not induced):
4. Soil threshold / dry reading / wet reading:
4. Automatic pulse / cooldown / wet-soil inhibition / two-attempt limit:
5. Rain during pulse / wet hold / dry-delay recovery:
6. Browser closure:
6. Backend restart:
6. Farm Wi-Fi interruption:
6. Backend-broker interruption:
7. Normal-power repeat (or same power throughout):
7. Final physical outputs off:
Other observations:
```

Coverage: implementation plan 20.1.7 (failure displays), 20.3.1–12 (pump
qualification and finish). Completed 20.2 non-pump checks remain recorded in
HARDWARE_ACCEPTANCE.md. Backend logs, roles, deployment evidence and final G10
handoff are implementation work, not extra physical chores for the operator.
