import {
  DEFAULT_AUTOMATIONS,
  LOCAL_FARM_ID,
  LOCAL_FARM_NAME,
  farmCommandRequestSchema,
  type AutomationSettings,
  type CommandDto,
  type FarmCommandRequest,
  type FarmSnapshot,
  type RuleId,
} from '@smartfarm/contracts';
import {
  AutomationEngine,
  assertCommandPolicy,
  CommandPolicyError,
  isFresh,
  mapFarmCommand,
  normalizeTelemetry,
  telemetryAgeMs,
  validateMqttCommand,
} from '@smartfarm/domain';
import type { AppConfig } from './config';
import type { FarmLink } from './farm-link';

const PUMP_BACKUP_STOP_MS = 3500;

export class FarmController {
  private commands = new Map<string, CommandDto>();
  private idempotency = new Map<string, CommandDto>();
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private driveTimer: ReturnType<typeof setInterval> | null = null;
  private settingsRevision = 1;
  readonly engine: AutomationEngine;

  constructor(
    readonly config: AppConfig,
    readonly link: FarmLink,
    private readonly now = () => Date.now(),
  ) {
    this.engine = new AutomationEngine({
      settings: DEFAULT_AUTOMATIONS,
      clock: this.now,
      send: async (control, payload) => {
        const mapped = validateMqttCommand(control, payload);
        await this.link.publish(mapped.topic, mapped.payload);
        if (control === 'pump' && payload === 'pulse') this.armPumpBackupStop();
      },
    });
    this.driveTimer = setInterval(() => this.drive(), 250);
    this.drive();
  }

  snapshot(): FarmSnapshot {
    this.drive();
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    const fresh = isFresh(age);
    const brokerReady = this.link.transport === 'memory' ? true : this.link.ready;
    const status = !latest || !brokerReady ? 'offline' : fresh ? 'live' : 'stale';
    const runtime = this.engine.runtime();
    return {
      protocolVersion: 1,
      farmId: this.config.FARM_ID,
      farmName: this.config.FARM_NAME,
      mode: this.config.FARM_MODE,
      simulation: this.config.FARM_MODE === 'simulator',
      connection: {
        controllerReady: true,
        brokerReady,
        fresh,
        telemetryAgeMs: age,
        transport: this.link.transport,
        status,
      },
      readings: latest ? normalizeTelemetry(latest.data) : null,
      wire: latest?.data ?? null,
      lcd: this.link.lcd,
      pendingCommands: [...this.commands.values()].filter((command) =>
        ['accepted', 'publishing', 'sent'].includes(command.status),
      ),
      permissions: { canControl: true, canView: true },
      automations: {
        revision: this.settingsRevision,
        settings: this.engine.settings,
        runtime,
      },
    };
  }

  startAutomations() {
    this.drive();
    this.engine.start();
    return this.snapshot();
  }

  pauseAutomations(reason = 'Paused by you') {
    this.engine.pause(reason);
    return this.snapshot();
  }

  resumeRule(rule: RuleId) {
    this.engine.resumeRule(rule);
    this.drive();
    return this.snapshot();
  }

  resetWatering() {
    this.engine.resetWatering();
    return this.snapshot();
  }

  configure(settings: AutomationSettings, expectedRevision?: number) {
    if (expectedRevision !== undefined && expectedRevision !== this.settingsRevision) {
      const error = new Error('Settings were updated elsewhere. Reload and apply again.');
      (error as Error & { code: string }).code = 'REVISION';
      throw error;
    }
    this.engine.configure(settings);
    this.settingsRevision += 1;
    this.drive();
    return this.snapshot();
  }

  syncGuard() {
    this.engine.syncGuard();
    this.drive();
    return this.snapshot();
  }

  async command(request: FarmCommandRequest, idempotencyKey: string): Promise<CommandDto> {
    const parsed = farmCommandRequestSchema.parse(request);
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) return existing;
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    const brokerReady = this.link.transport === 'memory' ? true : this.link.ready;
    assertCommandPolicy({
      request: parsed,
      mode: this.config.FARM_MODE,
      liveCommandsEnabled: this.config.LIVE_COMMANDS_ENABLED,
      livePumpEnabled: this.config.LIVE_PUMP_ENABLED,
      controllerReady: true,
      brokerReady,
      telemetryAgeMs: age,
      telemetry: latest?.data ?? null,
    });
    const mapped = mapFarmCommand(parsed);
    this.engine.takeManual(mapped.control);
    const dto: CommandDto = {
      id: crypto.randomUUID(),
      action: parsed.type,
      status: 'sent',
      confirmationMode:
        parsed.type === 'pump.pulse'
          ? 'pulse_observation'
          : parsed.type === 'buzzer.beep' || parsed.type.startsWith('lcd.')
            ? 'not_reported'
            : 'state_match',
      requestedAt: new Date(this.now()).toISOString(),
      sentAt: new Date(this.now()).toISOString(),
      stateMatchedAt: null,
      reason: null,
    };
    await this.link.publish(mapped.topic, mapped.payload);
    if (parsed.type === 'pump.pulse') this.armPumpBackupStop();
    this.commands.set(dto.id, dto);
    this.idempotency.set(idempotencyKey, dto);
    return dto;
  }

  async close() {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    if (this.driveTimer) clearInterval(this.driveTimer);
    await this.link.close();
  }

  private drive() {
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    if (latest) this.engine.sample(latest.data);
    this.engine.tick(isFresh(age));
  }

  private armPumpBackupStop() {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(() => {
      void this.link.publish('smartfarm/cmd/pump', 'off').catch(() => undefined);
    }, PUMP_BACKUP_STOP_MS);
  }
}

export { CommandPolicyError, LOCAL_FARM_ID, LOCAL_FARM_NAME };
