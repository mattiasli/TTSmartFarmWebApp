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
import { RevisionConflictError } from './db/errors';
import { FarmStore } from './db/store';
import type { FarmLink } from './farm-link';

const PUMP_BACKUP_STOP_MS = 3500;

export class FarmController {
  private commands = new Map<string, CommandDto>();
  private idempotency = new Map<string, CommandDto>();
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private driveTimer: ReturnType<typeof setInterval> | null = null;
  private settingsRevision = 1;
  readonly engine: AutomationEngine;
  private readonly store: FarmStore | null;

  constructor(
    readonly config: AppConfig,
    readonly link: FarmLink,
    private readonly now = () => Date.now(),
    store: FarmStore | null = null,
    initial?: { settings?: AutomationSettings; revision?: number },
  ) {
    this.store = store;
    this.settingsRevision = initial?.revision ?? 1;
    this.engine = new AutomationEngine({
      settings: initial?.settings ?? DEFAULT_AUTOMATIONS,
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
    void this.persistRuntime();
    return this.snapshot();
  }

  pauseAutomations(reason = 'Paused by you') {
    this.engine.pause(reason);
    void this.persistRuntime();
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

  async configure(settings: AutomationSettings, expectedRevision?: number) {
    if (this.store) {
      const saved = await this.store.saveConfig({
        farmId: this.config.FARM_ID,
        settings,
        expectedRevision: expectedRevision ?? this.settingsRevision,
      });
      this.engine.configure(saved.settings);
      this.settingsRevision = saved.revision;
      this.drive();
      return this.snapshot();
    }
    if (expectedRevision !== undefined && expectedRevision !== this.settingsRevision) {
      throw new RevisionConflictError();
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

  async command(request: FarmCommandRequest, idempotencyKey: string, actorScope = 'user:local'): Promise<CommandDto> {
    const parsed = farmCommandRequestSchema.parse(request);
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) return existing;
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    const brokerReady = this.link.transport === 'memory' ? true : this.link.ready;
    let reservedId: string | null = null;
    if (this.store) {
      const reserved = await this.store.reserveCommand({
        farmId: this.config.FARM_ID,
        actorScope,
        idempotencyKey,
        request: parsed,
      });
      if (!reserved.dispatched) {
        this.commands.set(reserved.command.id, reserved.command);
        this.idempotency.set(idempotencyKey, reserved.command);
        return reserved.command;
      }
      reservedId = reserved.command.id;
    }
    try {
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
        id: reservedId ?? crypto.randomUUID(),
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
      if (this.store && reservedId) {
        await this.store.updateCommandStatus({
          id: reservedId,
          status: 'sent',
          sentAt: new Date(this.now()),
        });
      }
      this.commands.set(dto.id, dto);
      this.idempotency.set(idempotencyKey, dto);
      return dto;
    } catch (error) {
      if (this.store && reservedId) {
        await this.store.updateCommandStatus({
          id: reservedId,
          status: 'rejected',
          reason: error instanceof Error ? error.message : 'Command failed.',
        });
      }
      throw error;
    }
  }

  async close() {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    if (this.driveTimer) clearInterval(this.driveTimer);
    await this.link.close();
  }

  private lastSampleMs = 0;

  private persistRuntime() {
    if (!this.store) return;
    const runtime = this.engine.runtime();
    return this.store.saveRuntime({
      farmId: this.config.FARM_ID,
      pausedReason: runtime.pausedReason || 'Paused — choose Start automations.',
      masterEnabled: runtime.masterEnabled,
      manualOverrides: runtime.manual,
      attempts: runtime.attempts,
      cooldownUntil:
        runtime.cooldownRemainingSeconds > 0
          ? new Date(this.now() + runtime.cooldownRemainingSeconds * 1000)
          : null,
      guardStatus: runtime.guardConfirmed ? 'confirmed' : 'unknown',
    });
  }

  private drive() {
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    if (latest) this.engine.sample(latest.data);
    this.engine.tick(isFresh(age));
    if (this.store && latest && this.now() - this.lastSampleMs >= 10_000) {
      this.lastSampleMs = this.now();
      void this.store.recordTelemetrySample(
        this.config.FARM_ID,
        latest.data as unknown as Record<string, unknown>,
        new Date(this.now()),
      );
    }
  }

  private armPumpBackupStop() {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(() => {
      void this.link.publish('smartfarm/cmd/pump', 'off').catch(() => undefined);
    }, PUMP_BACKUP_STOP_MS);
  }
}

export { CommandPolicyError, LOCAL_FARM_ID, LOCAL_FARM_NAME };
