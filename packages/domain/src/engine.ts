import {
  DEFAULT_AUTOMATIONS,
  RULE_IDS,
  type AutomationRuntimeView,
  type AutomationSettings,
  type RuleId,
  type WireTelemetry,
} from '@smartfarm/contracts';
import { validateAutomations } from './settings';

type SendFn = (
  control: string,
  payload: string,
  options?: { cleanup?: boolean },
) => void | Promise<void>;

type Pending = {
  id: number;
  time: number;
  packet: number;
  expected: number;
  low?: number;
  recover?: number;
};

const CONTROL_RULE: Record<string, RuleId> = {
  pump: 'irrigation',
  fan: 'cooling',
  led: 'lighting',
  buzzer: 'alarm',
};
const STATE_KEY: Record<string, keyof WireTelemetry> = {
  pump: 'pump',
  fan: 'fan',
  led: 'led',
  buzzer: 'buzz',
  backlight: 'bl',
};

export class AutomationEngine {
  settings: AutomationSettings;
  enabled = false;
  fresh = false;
  data: WireTelemetry | null = null;
  reason = 'Paused — choose Start automations.';
  messages: Record<RuleId, string> = {
    irrigation: this.reason,
    alarm: this.reason,
    rain: this.reason,
    cooling: this.reason,
    lighting: this.reason,
  };
  attempts = 0;
  alarmActive = false;
  tankIsLow = true;
  readonly manual = new Set<RuleId>();
  readonly faults: Partial<Record<RuleId | 'guard', string>> = {};

  private readonly send: SendFn;
  private readonly event: (message: string) => void;
  private readonly clock: () => number;
  private packet = 0;
  private readonly owned = new Set<string>();
  private readonly pending = new Map<string, Pending>();
  private readonly issuedIds = new Map<string, number>();
  private dark = false;
  private lastMotion = -Infinity;
  private drySince: number | null = null;
  private nextWater = 0;
  private lastPumpOff: number | undefined;
  private pulse: { started: number; seenOn: boolean; stopping: boolean } | null = null;
  private lastBeep = -Infinity;
  private savedLcd = 'status';
  private savedBacklight: 0 | 1 | null = null;
  private serial = 0;
  private guardDirty = false;

  constructor({
    settings = DEFAULT_AUTOMATIONS,
    send,
    event = () => undefined,
    clock = () => Date.now(),
  }: {
    settings?: AutomationSettings;
    send: SendFn;
    event?: (message: string) => void;
    clock?: () => number;
  }) {
    this.settings = validateAutomations(settings);
    this.send = send;
    this.event = event;
    this.clock = clock;
  }

  configure(input: unknown) {
    const next = validateAutomations(input);
    if (next.tankLow !== this.settings.tankLow || next.tankRecover !== this.settings.tankRecover) {
      this.tankIsLow = true;
      this.guardDirty = true;
      delete this.faults.guard;
      this.pending.delete('pumpguard');
      this.stopPump('Tank protection settings changed');
    }
    this.settings = next;
    if (this.lastPumpOff !== undefined) {
      this.nextWater = Math.max(this.nextWater, this.lastPumpOff + next.cooldown * 1000);
    }
    this.evaluate();
  }

  syncGuard() {
    this.guardDirty = true;
    delete this.faults.guard;
    this.pending.delete('pumpguard');
    this.evaluate();
  }

  start() {
    if (!this.fresh) throw new Error('Wait for fresh farm readings before starting automations.');
    this.enabled = true;
    this.reason = '';
    this.nextWater = Math.max(this.nextWater, this.clock() + this.settings.cooldown * 1000);
    this.event('Automations started. Irrigation begins with a settling wait.');
    this.evaluate();
  }

  pause(reason = 'Paused by you') {
    this.enabled = false;
    this.reason = reason;
    this.messages = Object.fromEntries(RULE_IDS.map((rule) => [rule, reason])) as Record<RuleId, string>;
    for (const control of ['pump', 'fan', 'led', 'buzzer']) this.release(control);
    this.endAlarm();
  }

  suspend(reason = 'Paused — connection lost. Resume when readings return.') {
    this.pause(reason);
    this.fresh = false;
    this.pending.clear();
    this.issuedIds.clear();
    this.pulse = null;
  }

  takeManual(control: string) {
    const rule = CONTROL_RULE[control];
    if (rule) {
      if (this.enabled && this.settings[rule]) this.manual.add(rule);
      this.owned.delete(control);
      this.pending.delete(control);
      this.issuedIds.delete(control);
    }
    if (control === 'pump') {
      this.pulse = null;
      this.nextWater = Math.max(this.nextWater, this.clock() + this.settings.cooldown * 1000);
    }
    if (control === 'buzzer') this.endAlarm();
    if (control === 'backlight') this.savedBacklight = null;
    if (control === 'all') this.pause('Paused by All off — resume explicitly.');
  }

  rememberLcd(payload: string) {
    this.savedLcd = payload;
    return this.alarmActive;
  }

  resumeRule(rule: RuleId) {
    if (!RULE_IDS.includes(rule)) throw new Error('Unknown automation.');
    this.manual.delete(rule);
    delete this.faults[rule];
    this.evaluate();
  }

  resetWatering() {
    if (this.data?.pump || this.pulse || this.pending.has('pump')) {
      throw new Error('Wait for the pump to stop before resetting watering.');
    }
    this.attempts = 0;
    delete this.faults.irrigation;
    delete this.faults.guard;
    this.nextWater = this.clock() + this.settings.cooldown * 1000;
    this.event('Watering attempts reset. A full settling wait starts now.');
  }

  restorePersisted(input: {
    attempts?: number;
    cooldownUntilMs?: number | null;
    lastPumpStopMs?: number | null;
    manual?: RuleId[];
    tankIsLow?: boolean;
  }) {
    this.enabled = false;
    this.attempts = input.attempts ?? this.attempts;
    if (input.lastPumpStopMs != null) this.lastPumpOff = input.lastPumpStopMs;
    if (input.cooldownUntilMs != null) this.nextWater = Math.max(this.nextWater, input.cooldownUntilMs);
    if (input.tankIsLow !== undefined) this.tankIsLow = input.tankIsLow;
    for (const rule of input.manual ?? []) this.manual.add(rule);
  }

  lastPumpStopMs() {
    return this.lastPumpOff;
  }

  guardStatus(): 'unknown' | 'pending' | 'confirmed' | 'failed' {
    if (this.faults.guard) return 'failed';
    if (this.guardDirty || this.pending.has('pumpguard')) return 'pending';
    if (
      this.data?.guard === 1 &&
      this.data.tankLow === this.settings.tankLow &&
      this.data.tankRecover === this.settings.tankRecover
    ) {
      return 'confirmed';
    }
    return 'unknown';
  }

  sample(data: WireTelemetry) {
    const previousPump = this.data?.pump;
    this.data = data;
    this.packet += 1;
    const now = this.clock();
    const s = this.settings;
    if (previousPump === 1 && data.pump === 0) {
      this.lastPumpOff = now;
      this.nextWater = Math.max(this.nextWater, now + s.cooldown * 1000);
    }
    if (data.water <= s.tankLow) this.tankIsLow = true;
    else if (data.water >= s.tankRecover) this.tankIsLow = false;
    if (data.pir) this.lastMotion = now;
    if (data.rain) this.drySince = null;
    else if (this.drySince === null) this.drySince = now;
    if (data.soil >= s.soilDry) this.attempts = 0;
    if (data.guard === 1 && data.tankLow === s.tankLow && data.tankRecover === s.tankRecover) {
      this.guardDirty = false;
    }
    for (const [control, pending] of this.pending) {
      const confirmed =
        control === 'pumpguard'
          ? data.guard === 1 && data.tankLow === pending.low && data.tankRecover === pending.recover
          : data[STATE_KEY[control] ?? 'pump'] === pending.expected;
      if (this.packet > pending.packet && confirmed) this.pending.delete(control);
    }
    if (this.pulse) {
      if (data.pump) this.pulse.seenOn = true;
      else if (this.pulse.seenOn || this.pulse.stopping) {
        this.lastPumpOff = now;
        this.nextWater = now + s.cooldown * 1000;
        this.pulse = null;
        this.owned.delete('pump');
      }
    }
  }

  tick(fresh: boolean) {
    const isLive = Boolean(fresh);
    if (!isLive && this.fresh && this.enabled) {
      this.suspend('Paused — readings stopped. Resume when the farm is live.');
    }
    this.fresh = isLive;
    this.evaluate();
  }

  runtime(): AutomationRuntimeView {
    return {
      masterEnabled: this.enabled,
      pausedReason: this.reason,
      messages: { ...this.messages },
      manual: [...this.manual],
      faults: { ...this.faults },
      attempts: this.attempts,
      cooldownRemainingSeconds: Math.max(0, Math.ceil((this.nextWater - this.clock()) / 1000)),
      tankIsLow: this.tankIsLow,
      guardConfirmed: this.data?.guard === 1,
      alarmActive: this.alarmActive,
    };
  }

  snapshot() {
    return {
      enabled: this.enabled,
      fresh: this.fresh,
      settings: { ...this.settings },
      messages: { ...this.messages },
      manual: [...this.manual],
      faults: { ...this.faults },
      attempts: this.attempts,
      alarmActive: this.alarmActive,
      reason: this.reason,
      guard: this.data?.guard === 1,
      tankIsLow: this.tankIsLow,
      remaining: Math.max(0, Math.ceil((this.nextWater - this.clock()) / 1000)),
    };
  }

  private issue(
    control: string,
    payload: string,
    reason: string,
    { confirm = true, cleanup = false }: { confirm?: boolean; cleanup?: boolean } = {},
  ) {
    if (this.pending.has(control) && payload !== 'off' && control !== 'lcd') return;
    const id = ++this.serial;
    this.issuedIds.set(control, id);
    const pending: Pending = {
      id,
      time: this.clock(),
      packet: this.packet,
      expected: payload === 'on' || payload === 'pulse' ? 1 : 0,
    };
    if (control === 'pumpguard') {
      pending.low = this.settings.tankLow;
      pending.recover = this.settings.tankRecover;
    }
    this.pending.set(control, pending);
    if (payload === 'on' || payload === 'pulse' || (control === 'buzzer' && payload !== 'off')) {
      this.owned.add(control);
    }
    const failed = (error: Error) => {
      if (this.pending.get(control)?.id !== id) return;
      this.pending.delete(control);
      if (!cleanup) {
        const rule = control === 'pumpguard' ? 'guard' : CONTROL_RULE[control] ?? 'alarm';
        this.faults[rule] = `${reason}: ${error.message || 'command failed'}. Resume to retry.`;
        if (control === 'pump') this.stopPump('Watering stopped after command failure');
      }
      this.event(`${reason}: command could not be confirmed.`);
    };
    try {
      void Promise.resolve(this.send(control, payload, { cleanup })).then(() => {
        if (this.issuedIds.get(control) !== id) return;
        if (!confirm) this.pending.delete(control);
        this.event(reason);
      }, failed);
    } catch (error) {
      failed(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private release(control: string) {
    if (!this.owned.has(control)) return;
    this.owned.delete(control);
    if (control === 'pump' && this.pulse) this.pulse.stopping = true;
    this.issue(control, 'off', `Automatic ${control} stopped`, { confirm: false, cleanup: true });
  }

  private stopPump(reason: string) {
    if (!this.pulse && !this.owned.has('pump')) return;
    if (this.pulse?.stopping) return;
    if (this.pulse) this.pulse.stopping = true;
    this.owned.delete('pump');
    this.issue('pump', 'off', reason, { cleanup: true });
  }

  private endAlarm() {
    this.release('buzzer');
    if (!this.alarmActive) return;
    this.alarmActive = false;
    this.issue('lcd', this.savedLcd, 'LCD restored after tank warning', { confirm: false, cleanup: true });
    if (this.savedBacklight === 0) {
      this.issue('backlight', 'off', 'LCD backlight restored', { confirm: false, cleanup: true });
    }
    this.savedBacklight = null;
  }

  private active(rule: RuleId) {
    return this.enabled && this.settings[rule] && !this.manual.has(rule) && !this.faults[rule];
  }

  private evaluate() {
    const now = this.clock();
    const d = this.data;
    const s = this.settings;
    if (!this.fresh || !d) return;
    if (d.light <= s.lightOn) this.dark = true;
    else if (d.light >= s.lightOff) this.dark = false;
    for (const [control, pending] of this.pending) {
      if (now - pending.time > 4500) {
        this.pending.delete(control);
        const rule = control === 'pumpguard' ? 'guard' : CONTROL_RULE[control] ?? 'alarm';
        this.faults[rule] = `${control} was not confirmed. Check the farm and resume.`;
        if (control === 'pump') this.stopPump('Unconfirmed watering stopped');
      }
    }
    if (this.pulse && now - this.pulse.started > 8500) {
      this.faults.irrigation = 'Pump stop was not confirmed. Check the farm before resuming.';
      this.pulse = null;
      this.owned.delete('pump');
    }
    this.messages = Object.fromEntries(
      RULE_IDS.map((rule) => [
        rule,
        !this.enabled
          ? this.reason
          : !s[rule]
            ? 'Off'
            : this.manual.has(rule)
              ? 'Manual — resume automatic when ready.'
              : this.faults[rule] || 'Watching the sensors',
      ]),
    ) as Record<RuleId, string>;
    for (const [control, rule] of Object.entries(CONTROL_RULE)) {
      if (!this.active(rule)) this.release(control);
    }
    if (!this.active('alarm') || !this.tankIsLow) this.endAlarm();
    const guardReady = d.guard === 1 && d.tankLow === s.tankLow && d.tankRecover === s.tankRecover;
    if (
      (this.guardDirty || this.active('irrigation')) &&
      d.guard === 1 &&
      !guardReady &&
      !this.pending.has('pumpguard') &&
      !this.faults.guard
    ) {
      this.issue('pumpguard', `${s.tankLow},${s.tankRecover}`, 'Saving pump protection thresholds on the farm');
    }
    if (!this.enabled) return;

    if (this.active('alarm')) {
      this.messages.alarm = this.tankIsLow
        ? `Tank low — ${d.water}%. Pump locked until ${s.tankRecover}%.`
        : `Tank OK — ${d.water}%.`;
      if (this.tankIsLow) {
        if (!this.alarmActive) {
          this.alarmActive = true;
          this.savedBacklight = d.bl;
          this.lastBeep = -Infinity;
          this.issue('lcd', 'TANK LOW|REFILL WATER', 'Tank low — refill the reservoir', { confirm: false });
          this.issue('backlight', 'on', 'Tank warning backlight enabled');
        }
        if (now - this.lastBeep >= s.beepInterval * 1000 && !this.pending.has('buzzer')) {
          this.lastBeep = now;
          this.issue('buzzer', '880', 'Tank warning beep sent', { confirm: false });
        }
      }
    }
    const rainBlocked =
      s.rain && (d.rain === 1 || this.drySince === null || now - this.drySince < s.rainDelay * 1000);
    if (s.rain) {
      this.messages.rain = d.rain
        ? 'Rain detected — automatic watering blocked.'
        : rainBlocked
          ? 'Waiting for the rain plate to stay dry.'
          : 'Rain plate is dry.';
    }
    if (
      this.pulse &&
      (this.tankIsLow || rainBlocked || d.soil >= s.soilDry || !guardReady || !this.active('irrigation'))
    ) {
      this.stopPump('Watering stopped — conditions changed');
    }
    if (this.active('irrigation')) {
      let message: string;
      if (this.faults.guard) message = this.faults.guard;
      else if (d.guard !== 1) message = 'Upload the updated FanMqtt firmware to enable protected watering.';
      else if (!guardReady) message = 'Waiting for the farm to confirm tank thresholds.';
      else if (this.tankIsLow || d.pumpBlocked) message = 'Pump blocked — tank low or sensor not ready.';
      else if (rainBlocked) message = 'Watering skipped — rain protection.';
      else if (this.pulse) message = this.pulse.stopping ? 'Waiting for the pump to stop.' : 'Watering with one short pulse.';
      else if (d.pump) message = 'Waiting — pump already running.';
      else if (d.soil >= s.soilDry) message = `Soil is moist enough — ${d.soil}%.`;
      else if (this.attempts >= s.maxPulses) {
        message = `Paused after ${this.attempts} pulses. Check the soil probe and reset watering.`;
        this.faults.irrigation ??= message;
      } else if (now < this.nextWater) {
        message = `Waiting ${Math.ceil((this.nextWater - now) / 1000)} seconds before watering again.`;
      } else {
        this.attempts += 1;
        this.pulse = { started: now, seenOn: false, stopping: false };
        this.issue('pump', 'pulse', `Watering started: soil ${d.soil}%, tank ${d.water}%, no rain block.`);
        message = 'Waiting for the farm to confirm the pump pulse.';
      }
      this.messages.irrigation = message;
    }
    if (this.active('cooling')) {
      if (!d.dht) this.messages.cooling = 'Paused — DHT11 unavailable. Fan left as-is.';
      else {
        const target = d.t >= s.fanOn ? 1 : d.t <= s.fanOff ? 0 : d.fan;
        this.messages.cooling = `${target ? 'Cooling' : 'Comfortable'} — ${d.t}°C; on ${s.fanOn}°C / off ${s.fanOff}°C.`;
        if (target !== d.fan && !this.pending.has('fan')) {
          this.issue('fan', target ? 'on' : 'off', `Fan ${target ? 'on' : 'off'} at ${d.t}°C`);
        }
      }
    }
    if (this.active('lighting')) {
      const target = this.dark && (!s.motionOnly || now - this.lastMotion < s.motionSeconds * 1000) ? 1 : 0;
      this.messages.lighting = !this.dark
        ? 'Daylight — light off.'
        : s.motionOnly && !target
          ? 'Dark — waiting for motion.'
          : 'Night light on.';
      if (target !== d.led && !this.pending.has('led')) {
        this.issue('led', target ? 'on' : 'off', `Night light ${target ? 'on' : 'off'} — roof light ${d.light}`);
      }
    }
  }
}
