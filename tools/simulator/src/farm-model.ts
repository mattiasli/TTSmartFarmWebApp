import { HEALTHY_TELEMETRY_FIXTURE, type WireTelemetry } from '@smartfarm/contracts';
import { scenarioTelemetry, validateMqttCommand } from '@smartfarm/domain';

const PUMP_MAX_MS = 4000;
const BEEP_MS = 400;

export class SimulatedFarm {
  data: WireTelemetry;
  lcdRemote = false;
  lcd = { line1: 'Smart Farm MQTT', line2: 'Starting...' };
  private pumpUntil = 0;
  private beepUntil = 0;

  constructor(initial: WireTelemetry = { ...HEALTHY_TELEMETRY_FIXTURE }) {
    this.data = { ...initial };
  }

  applyScenario(name: string) {
    this.data = scenarioTelemetry(name);
    this.tick(0);
  }

  applyCommand(topic: string, payload: string, nowMs: number) {
    const leaf = topic.split('/').pop() ?? topic;
    const command = validateMqttCommand(leaf, payload);
    switch (command.control) {
      case 'fan':
        this.data.fan = command.payload === 'on' ? 1 : 0;
        break;
      case 'led':
        this.data.led = command.payload === 'on' ? 1 : 0;
        break;
      case 'backlight':
        this.data.bl = command.payload === 'on' ? 1 : 0;
        break;
      case 'feeder':
        this.data.feed = command.payload === 'open' ? 1 : 0;
        break;
      case 'pump':
        if (command.payload === 'pulse' || command.payload === 'on') this.startPump(nowMs);
        else this.data.pump = 0;
        break;
      case 'buzzer':
        if (/^[0-9]+$/.test(command.payload)) {
          this.data.buzz = 1;
          this.beepUntil = nowMs + BEEP_MS;
        } else {
          this.beepUntil = 0;
          this.data.buzz = command.payload === 'on' ? 1 : 0;
        }
        break;
      case 'lcd':
        if (command.payload === 'status') this.lcdRemote = false;
        else {
          const [line1 = '', line2 = ''] = command.payload.split('|');
          this.lcd = { line1, line2 };
          this.lcdRemote = true;
        }
        break;
      case 'all':
        this.data.fan = 0;
        this.data.led = 0;
        this.data.pump = 0;
        this.data.buzz = 0;
        this.data.feed = 0;
        this.pumpUntil = 0;
        this.beepUntil = 0;
        break;
      case 'pumpguard': {
        const [lowRaw, recoverRaw] = command.payload.split(',');
        const tankLow = Number(lowRaw);
        const tankRecover = Number(recoverRaw);
        this.data.guard = 1;
        this.data.tankLow = tankLow;
        this.data.tankRecover = tankRecover;
        this.data.pumpBlocked = 2;
        this.data.pump = 0;
        break;
      }
      default:
        break;
    }
  }

  tick(nowMs: number) {
    if (this.data.pump === 1 && nowMs >= this.pumpUntil) this.data.pump = 0;
    if (this.beepUntil && nowMs >= this.beepUntil) {
      this.data.buzz = 0;
      this.beepUntil = 0;
    }
    this.data.rain = this.data.steam >= 800 ? 1 : 0;
    this.updateGuard();
    if (this.data.pump === 1 && this.data.pumpBlocked !== 0) this.data.pump = 0;
  }

  snapshot(): WireTelemetry {
    return { ...this.data };
  }

  private startPump(nowMs: number) {
    this.updateGuard();
    if (this.data.pumpBlocked !== 0) return;
    this.data.pump = 1;
    this.pumpUntil = nowMs + PUMP_MAX_MS;
  }

  private updateGuard() {
    if (this.data.guard !== 1) return;
    const low = this.data.tankLow ?? 20;
    const recover = this.data.tankRecover ?? 30;
    if (this.data.water < 0 || this.data.water > 100) {
      this.data.pumpBlocked = 2;
      return;
    }
    if (this.data.water <= low) this.data.pumpBlocked = 1;
    else if (this.data.water >= recover) this.data.pumpBlocked = 0;
  }
}
