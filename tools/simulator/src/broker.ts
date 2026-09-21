import { createServer } from 'node:net';
import { Aedes } from 'aedes';

export async function startLoopbackBroker(port = 1883, onPublish?: (topic: string, payload: Buffer) => void) {
  const broker = await Aedes.createBroker();
  if (onPublish) broker.on('publish', (packet) => onPublish(packet.topic, Buffer.from(packet.payload)));
  const server = createServer(broker.handle);
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        close: () =>
          new Promise((done) => {
            // Stop accepting connections and close existing MQTT clients together.
            // Waiting for TCP close before closing clients deadlocks a live broker.
            let pending = 2;
            const finished = () => { if (--pending === 0) done(); };
            server.close(finished);
            void broker.close(finished);
          }),
      });
    });
  });
}
