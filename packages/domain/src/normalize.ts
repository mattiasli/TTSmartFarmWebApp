import type { WireTelemetry } from '@smartfarm/contracts';

export type NormalizedTelemetry = {
  temperatureC: number | null;
  humidityPct: number | null;
  dhtHealthy: boolean;
  soilPct: number;
  waterPct: number;
  lightRaw: number;
  steamRaw: number;
  rain: boolean;
  distanceCm: number | null;
  pir: boolean;
  button: boolean;
  rssiDbm: number;
  fan: boolean;
  led: boolean;
  feederOpen: boolean;
  pump: boolean;
  buzzer: boolean;
  backlight: boolean;
  guard: boolean;
  tankLow: number | null;
  tankRecover: number | null;
  pumpBlocked: 0 | 1 | 2 | null;
};

export function normalizeTelemetry(data: WireTelemetry): NormalizedTelemetry {
  return {
    temperatureC: data.dht === 1 ? data.t : null,
    humidityPct: data.dht === 1 ? data.h : null,
    dhtHealthy: data.dht === 1,
    soilPct: data.soil,
    waterPct: data.water,
    lightRaw: data.light,
    steamRaw: data.steam,
    rain: data.rain === 1,
    distanceCm: data.dist < 0 ? null : data.dist,
    pir: data.pir === 1,
    button: data.btn === 1,
    rssiDbm: data.rssi,
    fan: data.fan === 1,
    led: data.led === 1,
    feederOpen: data.feed === 1,
    pump: data.pump === 1,
    buzzer: data.buzz === 1,
    backlight: data.bl === 1,
    guard: data.guard === 1,
    tankLow: data.tankLow ?? null,
    tankRecover: data.tankRecover ?? null,
    pumpBlocked: data.pumpBlocked ?? null,
  };
}
