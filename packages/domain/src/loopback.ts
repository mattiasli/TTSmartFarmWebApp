const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function assertLoopbackMqttUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Simulator MQTT URL is invalid.');
  }
  if (parsed.protocol !== 'mqtt:' && parsed.protocol !== 'tcp:') {
    throw new Error('Simulator MQTT URL must use mqtt:// on loopback. Do not use the production HiveMQ URL.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('Simulator MQTT URL must be loopback (127.0.0.1). Ordinary tests must never reach HiveMQ.');
  }
  if (parsed.hostname.endsWith('hivemq.cloud') || parsed.hostname.includes('hivemq.cloud')) {
    throw new Error('Refusing to point the simulator at HiveMQ.');
  }
  return parsed;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const host = address.replace('::ffff:', '');
  return LOOPBACK_HOSTS.has(host) || host === '::ffff:127.0.0.1';
}
