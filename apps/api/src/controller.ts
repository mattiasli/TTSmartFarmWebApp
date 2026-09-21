import {
  DEFAULT_AUTOMATIONS,
  LOCAL_FARM_ID,
  LOCAL_FARM_NAME,
  farmCommandRequestSchema,
  type AutomationSettings,
  type CommandDto,
  type ControllerOwnership,
  type FarmCommandRequest,
  type FarmSnapshot,
  type RuleId,
  type WireTelemetry,
} from '@smartfarm/contracts';
import {
  AutomationEngine,
  CommandPolicyError,
  PUBLISH_DEADLINE_MS,
  PUMP_WATCHDOG_MS,
  STATE_MATCH_MS,
  actuatorFor,
  assertCommandPolicy,
  confirmationModeFor,
  isFresh,
  isPendingStatus,
  isPendingCommand,
  isStopCommand,
  mapFarmCommand,
  matchesExpectedState,
  normalizeTelemetry,
  requestFromControl,
  sameCommandRequest,
  stopSupersedes,
  telemetryAgeMs,
  validateMqttCommand,
} from '@smartfarm/domain';
import type { AppConfig } from './config';
import { type ControllerLock } from './db/lock';
import { IdempotencyConflictError, RevisionConflictError } from './db/errors';
import { FarmStore } from './db/store';
import type { FarmLink } from './farm-link';

const PUMP_BACKUP_STOP_MS = 3500;

type TrackedCommand = CommandDto & {
  request: FarmCommandRequest;
  actuator: string;
  mqttEpoch: string;
  receiveSequence: number;
  dispatched: boolean;
};

export class FarmController {
  private commands = new Map<string, TrackedCommand>();
  private idempotency = new Map<string, TrackedCommand>();
  private receiveSequence = 0;
  private lastReceivedAtMs = Number.NEGATIVE_INFINITY;
  private lastSampleMs = 0;
  private lastPersistedAttempts = -1;
  private publishChain = Promise.resolve();
  private ownershipGeneration = 0;
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private pumpWatchdog: ReturnType<typeof setTimeout> | null = null;
  private matchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private driveTimer: ReturnType<typeof setInterval> | null = null;
  private ownershipRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private ownershipAttempt: Promise<boolean> | null = null;
  private settingsRevision = 1;
  readonly engine: AutomationEngine;
  private readonly store: FarmStore | null;
  private lock: ControllerLock | null;
  ownership: ControllerOwnership;
  readonly controllerEpoch = crypto.randomUUID();
  private draining = false;
  private drainPromise: Promise<void> | null = null;
  private seenMqttEpoch: string | null = null;

  constructor(
    readonly config: AppConfig,
    readonly link: FarmLink,
    private readonly now = () => Date.now(),
    store: FarmStore | null = null,
    initial?: {
      settings?: AutomationSettings;
      revision?: number;
      lock?: ControllerLock | null;
      ownership?: ControllerOwnership;
      runtime?: {
        attempts?: number;
        cooldownUntilMs?: number | null;
        lastPumpStopMs?: number | null;
        manual?: RuleId[];
        tankIsLow?: boolean;
      };
    },
  ) {
    this.store = store;
    this.lock = initial?.lock ?? null;
    this.ownership = initial?.ownership ?? (this.lock ? 'waiting_for_owner' : 'owner');
    this.settingsRevision = initial?.revision ?? 1;
    this.engine = new AutomationEngine({
      settings: initial?.settings ?? DEFAULT_AUTOMATIONS,
      clock: this.now,
      send: async (control, payload, options) => {
        if (control === 'pumpguard') {
          await this.assertCanPublish();
          const mapped = validateMqttCommand(control, payload);
          await this.link.publish(mapped.topic, mapped.payload);
          return;
        }
        const request = requestFromControl(control, payload);
        await this.command(request, crypto.randomUUID(), 'automation:engine');
        if (options?.cleanup && control === 'pump') this.armPumpBackupStop();
      },
    });
    if (initial?.runtime) this.engine.restorePersisted(initial.runtime);
    this.engine.pause('Paused after backend start. Resume explicitly.');
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
        controllerReady: this.ownership === 'owner' && !this.draining,
        brokerReady,
        fresh,
        telemetryAgeMs: age,
        transport: this.link.transport,
        status,
        ownership: this.ownership,
        controllerEpoch: this.controllerEpoch,
        mqttEpoch: this.link.mqttEpoch,
      },
      readings: latest ? normalizeTelemetry(latest.data) : null,
      wire: latest?.data ?? null,
      lcd: this.link.lcd,
      pendingCommands: [...this.commands.values()].filter(isPendingCommand),
      permissions: { canControl: this.config.FARM_MODE === 'simulator' || this.config.LIVE_COMMANDS_ENABLED, canView: true },
      automations: {
        revision: this.settingsRevision,
        settings: this.engine.settings,
        runtime,
      },
    };
  }

  diagnostics() {
    const snap = this.snapshot();
    return {
      ownership: this.ownership,
      releaseSha: this.config.RELEASE_SHA,
      controllerEpoch: this.controllerEpoch,
      mqttEpoch: this.link.mqttEpoch,
      brokerReady: snap.connection.brokerReady,
      fresh: snap.connection.fresh,
      telemetryAgeMs: snap.connection.telemetryAgeMs,
      draining: this.draining,
      simulation: snap.simulation,
      liveCommandsEnabled: this.config.LIVE_COMMANDS_ENABLED,
      livePumpEnabled: this.config.LIVE_PUMP_ENABLED,
    };
  }

  becomeOwner(): Promise<boolean> {
    if (this.draining) return Promise.resolve(false);
    if (this.ownershipAttempt) return this.ownershipAttempt;
    if (this.lock?.held && this.ownership === 'owner') return Promise.resolve(true);
    if (this.ownershipRetryTimer) clearTimeout(this.ownershipRetryTimer);
    this.ownershipAttempt = this.acquireOwnership().finally(() => {
      this.ownershipAttempt = null;
      if (this.lock && !this.draining && this.ownership !== 'owner') {
        this.ownershipRetryTimer = setTimeout(() => {
          void this.becomeOwner().catch(() => undefined);
        }, 1_000);
      }
    });
    return this.ownershipAttempt;
  }

  private async acquireOwnership() {
    if (!this.lock) {
      this.ownership = 'owner';
      this.engine.pause('Paused after backend start. Resume explicitly.');
      await this.abandonPendingFromStore('Controller restarted before confirmation.');
      this.persistInBackground(this.persistRuntime());
      return true;
    }
    const acquired = await this.lock.tryAcquire();
    if (!acquired) return false;
    try {
      if (this.draining) {
        await this.lock.release();
        return false;
      }
      // The previous owner may have saved settings/runtime while we waited.
      // Read them under ownership before exposing a controller that can mutate.
      if (this.store) {
        const saved = await this.store.getConfig(this.config.FARM_ID);
        const runtime = await this.store.getRuntime(this.config.FARM_ID);
        if (saved) {
          this.engine.configure(saved.settings);
          this.settingsRevision = saved.revision;
        }
        if (runtime) {
          this.engine.restorePersisted({
            attempts: runtime.attempts,
            cooldownUntilMs: runtime.cooldownUntil?.getTime() ?? null,
            lastPumpStopMs: runtime.lastPumpStopAt?.getTime() ?? null,
            manual: runtime.manualOverrides,
          });
        }
      }
      this.engine.pause('Paused after backend start. Resume explicitly.');
      await this.abandonPendingFromStore('Controller restarted before confirmation.');
      await this.persistRuntime();
      if (this.draining) {
        await this.lock.release();
        return false;
      }
      this.ownership = 'owner';
      return true;
    } catch (error) {
      this.ownership = 'waiting_for_owner';
      await this.lock.release();
      throw error;
    }
  }

  startAutomations() {
    this.assertOwner();
    this.assertCommandsEnabled();
    this.drive();
    this.engine.start();
    this.persistInBackground(this.persistRuntime());
    return this.snapshot();
  }

  pauseAutomations(reason = 'Paused by you') {
    this.assertOwner();
    this.engine.pause(reason);
    this.persistInBackground(this.persistRuntime());
    return this.snapshot();
  }

  resumeRule(rule: RuleId) {
    this.assertOwner();
    this.assertCommandsEnabled();
    this.engine.resumeRule(rule);
    this.drive();
    return this.snapshot();
  }

  resetWatering() {
    this.assertOwner();
    this.engine.resetWatering();
    return this.snapshot();
  }

  async configure(settings: AutomationSettings, expectedRevision?: number) {
    this.assertOwner();
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
    this.assertOwner();
    this.assertCommandsEnabled();
    this.engine.syncGuard();
    this.drive();
    return this.snapshot();
  }

  getCommand(id: string) {
    return this.commands.get(id) ?? null;
  }

  async command(request: FarmCommandRequest, idempotencyKey: string, actorScope = 'user:local'): Promise<CommandDto> {
    this.assertOwner();
    const parsed = farmCommandRequestSchema.parse(request);
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      if (!sameCommandRequest(existing.request, parsed)) {
        throw new IdempotencyConflictError();
      }
      return existing;
    }
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    const brokerReady = this.link.transport === 'memory' ? true : this.link.ready;
    let reservedId: string | null = null;
    if (this.store) {
      const reserved = await this.store.reserveCommand({
        farmId: this.config.FARM_ID,
        actorScope,
        source: actorScope.startsWith('automation') ? 'automation' : 'user',
        idempotencyKey,
        request: parsed,
        connectionEpoch: this.link.mqttEpoch,
        receiveSequence: this.receiveSequence,
      });
      if (!reserved.dispatched) {
        const trackedExisting = this.toTracked(reserved.command.payload, reserved.command, {
          mqttEpoch: reserved.command.connectionEpoch ?? this.link.mqttEpoch,
          receiveSequence: reserved.command.receiveSequence ?? this.receiveSequence,
          dispatched: reserved.command.status !== 'accepted',
        });
        this.commands.set(trackedExisting.id, trackedExisting);
        this.idempotency.set(idempotencyKey, trackedExisting);
        return trackedExisting;
      }
      reservedId = reserved.command.id;
    }
    const tracked = this.toTracked(parsed, {
      id: reservedId ?? crypto.randomUUID(),
      action: parsed.type,
      status: 'accepted',
      confirmationMode: confirmationModeFor(parsed.type),
      requestedAt: new Date(this.now()).toISOString(),
      sentAt: null,
      stateMatchedAt: null,
      reason: null,
    });
    this.commands.set(tracked.id, tracked);
    this.idempotency.set(idempotencyKey, tracked);
    try {
      if (isStopCommand(parsed.type)) this.supersedePending(parsed.type, tracked.id);
      assertCommandPolicy({
        request: parsed,
        mode: this.config.FARM_MODE,
        liveCommandsEnabled: this.config.LIVE_COMMANDS_ENABLED,
        livePumpEnabled: this.config.LIVE_PUMP_ENABLED,
        controllerReady: this.ownership === 'owner' && !this.draining,
        brokerReady,
        telemetryAgeMs: age,
        telemetry: latest?.data ?? null,
        rainRuleEnabled: this.engine.settings.rain,
        unresolvedPump: this.hasUnresolvedPump(tracked.id),
      });
      if (!isStopCommand(parsed.type) && this.hasPendingActuator(tracked.actuator, tracked.id)) {
        throw new CommandPolicyError('ACTUATOR_BUSY', 'Wait for the current command on this output to finish.');
      }
      const mapped = mapFarmCommand(parsed);
      if (actorScope !== 'automation:engine') {
        this.engine.takeManual(mapped.control);
        if (mapped.control === 'lcd' && this.engine.rememberLcd(mapped.payload)) {
          tracked.status = 'sent';
          tracked.reason = 'Saved — the tank warning currently owns the display.';
          await this.persistCommand(tracked);
          return tracked;
        }
      }
      tracked.status = 'publishing';
      await this.assertCanPublish();
      await this.publishSerialized(tracked, mapped.topic, mapped.payload);
      if (this.commands.get(tracked.id)?.status === 'superseded') {
        await this.persistCommand(tracked);
        return tracked;
      }
      tracked.status = 'sent';
      tracked.sentAt = new Date(this.now()).toISOString();
      tracked.dispatched = true;
      tracked.mqttEpoch = this.link.mqttEpoch;
      tracked.receiveSequence = this.receiveSequence;
      if (parsed.type === 'pump.pulse') this.armPumpBackupStop();
      await this.persistCommand(tracked);
      this.scheduleMatch(tracked);
      return tracked;
    } catch (error) {
      if (!tracked.dispatched) {
        tracked.status = 'rejected';
        tracked.reason = error instanceof Error ? error.message : 'Command failed.';
        await this.persistCommand(tracked);
      } else {
        tracked.status = 'uncertain';
        tracked.reason = error instanceof Error ? error.message : 'Publish result is uncertain.';
        await this.persistCommand(tracked);
      }
      throw error;
    }
  }

  drain(): Promise<void> {
    this.drainPromise ??= this.performDrain();
    return this.drainPromise;
  }

  private async performDrain() {
    const wasOwner = this.ownership === 'owner';
    this.draining = true;
    if (this.ownershipRetryTimer) clearTimeout(this.ownershipRetryTimer);
    this.ownership = 'draining';
    this.engine.pause('Paused after backend restart. Resume explicitly.');
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    if (this.pumpWatchdog) clearTimeout(this.pumpWatchdog);
    this.clearMatchTimers();
    this.markPendingUncertain('Controller drained before confirmation.');
    if (wasOwner && this.lock?.held && this.link.ready &&
        (this.config.FARM_MODE === 'simulator' || this.config.LIVE_COMMANDS_ENABLED)) {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let stopWindowOpen = true;
      try {
        await Promise.race([
          (async () => {
            if (await this.lock?.isHealthy() && stopWindowOpen && this.lock?.held) {
              await this.link.publish('smartfarm/cmd/pump', 'off');
            }
          })(),
          new Promise<void>((_, reject) => {
            deadline = setTimeout(() => reject(new Error('Drain stop deadline.')), PUBLISH_DEADLINE_MS);
          }),
        ]);
      } catch {
        // Bounded cleanup; firmware still has its own cap.
      } finally {
        stopWindowOpen = false;
        if (deadline) clearTimeout(deadline);
      }
    }
    if (wasOwner) await this.persistRuntime();
  }

  async close() {
    this.draining = true;
    if (this.ownershipRetryTimer) clearTimeout(this.ownershipRetryTimer);
    await this.ownershipAttempt?.catch(() => undefined);
    await this.drain();
    if (this.driveTimer) clearInterval(this.driveTimer);
    await this.link.close();
    await this.lock?.release();
    this.ownership = 'waiting_for_owner';
  }

  private assertOwner() {
    if (this.lock && !this.lock.held && this.ownership === 'owner') this.loseOwnership();
    if (this.draining || this.ownership !== 'owner') {
      throw new CommandPolicyError(
        'CONTROLLER_UNAVAILABLE',
        this.ownership === 'waiting_for_owner'
          ? 'Another controller currently owns this farm. Retry shortly.'
          : 'Farm controller is draining.',
        503,
      );
    }
  }

  private assertCommandsEnabled() {
    if (this.config.FARM_MODE === 'live' && !this.config.LIVE_COMMANDS_ENABLED) {
      throw new CommandPolicyError('LIVE_COMMANDS_DISABLED', 'Live commands are disabled.');
    }
  }

  private async assertCanPublish() {
    this.assertCommandsEnabled();
    this.assertOwner();
    if (this.lock && !(await this.lock.isHealthy())) {
      this.loseOwnership();
      throw new CommandPolicyError('CONTROLLER_UNAVAILABLE', 'Controller lock is no longer valid.', 503);
    }
    this.assertOwner();
  }

  private loseOwnership() {
    if (this.draining) return;
    this.ownershipGeneration += 1;
    this.ownership = 'waiting_for_owner';
    this.engine.pause('Paused — controller lock lost. Resume when ownership returns.');
    void this.becomeOwner().catch(() => undefined);
  }

  private persistInBackground(work: Promise<unknown> | undefined) {
    void work?.catch(() => {
      // A lost background write must pause control, never crash the process.
      // Reacquisition reloads persisted state before making control available.
      if (this.ownership === 'owner') this.loseOwnership();
    });
  }

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
      lastPumpStopAt: this.engine.lastPumpStopMs() != null ? new Date(this.engine.lastPumpStopMs()!) : null,
      guardTarget: { tankLow: this.engine.settings.tankLow, tankRecover: this.engine.settings.tankRecover },
      guardStatus: this.engine.guardStatus(),
    });
  }

  private drive() {
    if (this.lock && !this.lock.held && this.ownership === 'owner') this.loseOwnership();
    // A waiting process must not overwrite the owner's runtime/history.
    if (this.ownership !== 'owner' || this.draining) return;
    if (this.seenMqttEpoch && this.seenMqttEpoch !== this.link.mqttEpoch) {
      this.engine.pause('Paused — MQTT reconnected. Resume explicitly.');
      this.markPendingUncertain('MQTT epoch changed before confirmation.');
      this.persistInBackground(this.persistRuntime());
    }
    this.seenMqttEpoch = this.link.mqttEpoch;
    const latest = this.link.latest();
    if (latest && latest.receivedAtMs > this.lastReceivedAtMs) {
      this.lastReceivedAtMs = latest.receivedAtMs;
      this.receiveSequence += 1;
      this.engine.sample(latest.data);
      this.observeCommands(latest.data, this.receiveSequence);
    }
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    this.engine.tick(isFresh(age));
    if (this.store && this.engine.attempts !== this.lastPersistedAttempts) {
      this.lastPersistedAttempts = this.engine.attempts;
      this.persistInBackground(this.persistRuntime());
    }
    if (this.store && latest && this.now() - this.lastSampleMs >= 10_000) {
      this.lastSampleMs = this.now();
      this.persistInBackground(this.store.recordTelemetrySample(
        this.config.FARM_ID,
        latest.data as unknown as Record<string, unknown>,
        new Date(this.now()),
      ));
    }
  }

  private armPumpBackupStop() {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    if (this.pumpWatchdog) clearTimeout(this.pumpWatchdog);
    this.pumpTimer = setTimeout(() => {
      void this.enqueuePublish('smartfarm/cmd/pump', 'off').catch(() => undefined);
    }, PUMP_BACKUP_STOP_MS);
    this.pumpWatchdog = setTimeout(() => {
      for (const command of this.commands.values()) {
        if (command.action === 'pump.pulse' && isPendingStatus(command.status)) {
          command.status = 'uncertain';
          command.reason = 'Pump pulse was not confirmed in time.';
          this.engine.pause('Paused — unresolved pump pulse. Inspect the farm before watering again.');
          this.persistInBackground(this.persistCommand(command));
          this.persistInBackground(this.persistRuntime());
        }
      }
    }, PUMP_WATCHDOG_MS);
  }

  private supersedePending(stopType: FarmCommandRequest['type'], byId: string) {
    for (const command of this.commands.values()) {
      if (command.id === byId) continue;
      if (command.status !== 'accepted' && command.status !== 'publishing') continue;
      if (!stopSupersedes(stopType, command.action)) continue;
      command.status = 'superseded';
      command.reason = 'Superseded by a stop.';
      this.persistInBackground(this.persistCommand(command, byId));
    }
  }

  private observeCommands(telemetry: WireTelemetry, sequence: number) {
    for (const command of this.commands.values()) {
      if (!isPendingStatus(command.status) || command.status === 'accepted') continue;
      if (command.mqttEpoch !== this.link.mqttEpoch) {
        command.status = 'uncertain';
        command.reason = 'MQTT epoch changed after publish.';
        this.persistInBackground(this.persistCommand(command));
        continue;
      }
      if (command.confirmationMode === 'not_reported') continue;
      if (sequence <= command.receiveSequence) continue;
      if (command.action === 'pump.pulse') {
        if (telemetry.pump === 1) command.reason = 'seen_running';
        if (telemetry.pump === 0 && command.reason === 'seen_running') {
          command.status = 'state_matched';
          command.stateMatchedAt = new Date(this.now()).toISOString();
          command.reason = 'Pulse observed on then off.';
          this.persistInBackground(this.persistCommand(command));
        }
        continue;
      }
      if (matchesExpectedState(command.request, telemetry)) {
        command.status = 'state_matched';
        command.stateMatchedAt = new Date(this.now()).toISOString();
        this.persistInBackground(this.persistCommand(command));
      }
    }
  }

  private scheduleMatch(command: TrackedCommand) {
    if (command.confirmationMode === 'not_reported') return;
    const existing = this.matchTimers.get(command.id);
    if (existing) clearTimeout(existing);
    this.matchTimers.set(
      command.id,
      setTimeout(() => {
        this.matchTimers.delete(command.id);
        if (command.status === 'sent') {
          command.status = 'uncertain';
          command.reason = 'No matching telemetry arrived in time.';
          this.persistInBackground(this.persistCommand(command));
        }
      }, STATE_MATCH_MS),
    );
  }

  private markPendingUncertain(reason: string) {
    for (const command of this.commands.values()) {
      if (!isPendingCommand(command) || command.status === 'accepted') continue;
      command.status = 'uncertain';
      command.reason = reason;
      this.persistInBackground(this.persistCommand(command));
    }
  }

  private persistCommand(command: TrackedCommand, supersededBy?: string) {
    if (!this.store) return;
    return this.store.updateCommandStatus({
      id: command.id,
      status: command.status,
      sentAt: command.sentAt ? new Date(command.sentAt) : null,
      stateMatchedAt: command.stateMatchedAt ? new Date(command.stateMatchedAt) : null,
      reason: command.reason,
      supersededBy: supersededBy ?? null,
    });
  }

  private toTracked(
    request: FarmCommandRequest,
    dto: CommandDto,
    extra?: Partial<Pick<TrackedCommand, 'mqttEpoch' | 'receiveSequence' | 'dispatched'>>,
  ): TrackedCommand {
    return {
      ...dto,
      request,
      actuator: actuatorFor(request.type),
      mqttEpoch: extra?.mqttEpoch ?? this.link.mqttEpoch,
      receiveSequence: extra?.receiveSequence ?? this.receiveSequence,
      dispatched: extra?.dispatched ?? dto.status !== 'accepted',
    };
  }

  private hasUnresolvedPump(exceptId: string) {
    return [...this.commands.values()].some(
      (command) =>
        command.id !== exceptId &&
        command.action === 'pump.pulse' &&
        (isPendingStatus(command.status) || command.status === 'uncertain'),
    );
  }

  private hasPendingActuator(actuator: string, exceptId: string) {
    return [...this.commands.values()].some(
      (command) =>
        command.id !== exceptId &&
        command.actuator === actuator &&
        isPendingCommand(command) &&
        !isStopCommand(command.action),
    );
  }

  private clearMatchTimers() {
    for (const timer of this.matchTimers.values()) clearTimeout(timer);
    this.matchTimers.clear();
  }

  private enqueuePublish(topic: string, payload: string, command?: TrackedCommand) {
    const generation = this.ownershipGeneration;
    const work = this.publishChain.then(async () => {
      await this.link.awaitHold?.();
      if (command && (command.status === 'superseded' || this.draining)) return;
      await this.assertCanPublish();
      if (generation !== this.ownershipGeneration) {
        throw new CommandPolicyError('CONTROLLER_UNAVAILABLE', 'Command belongs to a lost controller session.', 503);
      }
      if (!this.link.ready && this.link.transport !== 'memory') {
        throw new CommandPolicyError('BROKER_UNAVAILABLE', 'MQTT client is not ready.', 503);
      }
      if (command) command.dispatched = true;
      await this.link.publish(topic, payload);
    });
    this.publishChain = work.catch(() => undefined);
    return work;
  }

  private async publishSerialized(command: TrackedCommand, topic: string, payload: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.enqueuePublish(topic, payload, command),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new CommandPolicyError('PUBLISH_TIMEOUT', 'MQTT publish did not complete in time.', 503)),
            PUBLISH_DEADLINE_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async abandonPendingFromStore(reason: string) {
    if (!this.store) return;
    const pending = await this.store.listPendingCommands(this.config.FARM_ID);
    for (const row of pending) {
      const tracked = this.toTracked(row.payload, row, {
        mqttEpoch: row.connectionEpoch ?? this.link.mqttEpoch,
        receiveSequence: row.receiveSequence ?? this.receiveSequence,
        dispatched: true,
      });
      tracked.status = 'uncertain';
      tracked.reason = reason;
      this.commands.set(tracked.id, tracked);
      this.idempotency.set(row.idempotencyKey, tracked);
      await this.persistCommand(tracked);
    }
  }
}

export { CommandPolicyError, LOCAL_FARM_ID, LOCAL_FARM_NAME };
