import {
  LOCAL_FARM_ID,
  LOCAL_FARM_NAME,
  farmCommandRequestSchema,
  type CommandDto,
  type FarmCommandRequest,
  type FarmSnapshot,
} from '@smartfarm/contracts';
import {
  assertCommandPolicy,
  CommandPolicyError,
  isFresh,
  mapFarmCommand,
  normalizeTelemetry,
  telemetryAgeMs,
} from '@smartfarm/domain';
import type { AppConfig } from './config';
import type { FarmLink } from './farm-link';

const PUMP_BACKUP_STOP_MS = 3500;

export class FarmController {
  private commands = new Map<string, CommandDto>();
  private idempotency = new Map<string, CommandDto>();
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly config: AppConfig,
    readonly link: FarmLink,
    private readonly now = () => Date.now(),
  ) {}

  snapshot(): FarmSnapshot {
    const latest = this.link.latest();
    const age = latest ? telemetryAgeMs(latest.receivedAtMs, this.now()) : null;
    const fresh = isFresh(age);
    const brokerReady = this.link.transport === 'memory' ? true : this.link.ready;
    const status = !latest || !brokerReady ? 'offline' : fresh ? 'live' : 'stale';
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
    };
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
    await this.link.close();
  }

  private armPumpBackupStop() {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(() => {
      void this.link.publish('smartfarm/cmd/pump', 'off').catch(() => undefined);
    }, PUMP_BACKUP_STOP_MS);
  }
}

export { CommandPolicyError, LOCAL_FARM_ID, LOCAL_FARM_NAME };
