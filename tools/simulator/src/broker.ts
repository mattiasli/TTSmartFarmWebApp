import { createServer } from 'node:net';
import { Aedes } from 'aedes';

export async function startLoopbackBroker(port = 1883) {
  const broker = await Aedes.createBroker();
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
            server.close(() => {
              void broker.close(() => done());
            });
          }),
      });
    });
  });
}
