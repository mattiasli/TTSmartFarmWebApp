# Completed manual session

Result (September 22): the operator confirmed Distance showed **Unavailable**
and then a sensible distance returned. The recording corroborates eight no-echo
samples and valid recovery. No other sensor failure was induced or reported.
This distance check is complete and does not need repeating. Evidence:
[recorded observation](releases/production-failure-displays-2026-09-22.json).

No further manual session is pending. The procedure below is retained as the
record of what was requested, not an instruction to repeat it. The operator
explicitly requested skipping all remaining pump-related tests on September 22
and keeping pump control enabled. Pump testing, calibration drills, power/freeze
qualification and pump-related connection interruptions are excluded from this
session. They are recorded as skipped, not passed.

Completed fan, LED, feeder, LCD, cooling, lighting, motion, alarm and Beep/Silence
checks do not need repeating. No pump action is needed for the checks below.
Leave master automations paused while observing the sensor displays.

## 1. Distance no-echo and recovery

1. Aim the ultrasonic distance sensor into open space with no nearby target.
2. Watch the Distance card for about 20 seconds. If a genuine no-echo reading
   occurs, expect **Unavailable**, not -1 cm or a frozen plausible distance.
3. Put a target back at a measurable distance and confirm a plausible value returns.

If the sensor keeps detecting objects, report **no echo not reproduced** rather
than a pass. Ordinary valid distance readings do not verify the failure display.

## 2. Other sensor failure displays, only if safely observable

If temperature/humidity or another sensor naturally reports failure, record
whether the dashboard shows an unavailable/invalid state and returns to a valid
reading after recovery. Do not disconnect powered sensors or damage them to
manufacture a failure. If no safe failure occurs, report **not induced**; that
physical case remains unverified.

## One report

```text
Distance: Unavailable seen / no echo not reproduced:
Distance: valid reading returned after replacing target:
Other sensor failure: sensor and displayed state / not induced:
Other sensor recovery, if observed:
Unexpected behavior:
```

## Pump-control decision

The user requested enabling pump control without performing the remaining pump
qualification. Both live enablement flags are intended to stay true; master
remains paused until explicitly started. Water briefly remains a bounded pulse,
with Stop pump and All off available. Existing tank, rain, freshness and uncertain
pump protections remain enforced. No unlimited-on mode or protection bypass is
part of this request. Configuration/button verification does not claim a physical
pump test or resolve the previously reported freeze.

Do not restore a blanket pump-disabled state merely because the original plan
required pump qualification; the latest user instruction overrides that scope.
See HARDWARE_ACCEPTANCE.md and IMPLEMENTATION_PROGRESS.md for the actual deployed
state and evidence. Backup/restore remains separately deferred.
