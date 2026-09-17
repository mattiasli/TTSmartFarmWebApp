import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { federationShared } from '../../tools/scripts/federation-shared.mjs';

const remoteEntry =
  process.env.VITE_AUTOMATIONS_REMOTE_URL ?? 'http://127.0.0.1:5174/remoteEntry.js';

export default defineConfig(({ isPreview }) => ({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    origin: 'http://127.0.0.1:5173',
    proxy: isPreview
      ? undefined
      : {
          '/api': {
            target: 'http://127.0.0.1:3001',
            changeOrigin: true,
          },
        },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {},
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    federation({
      name: 'smartfarm_host',
      filename: 'remoteEntry.js',
      dts: false,
      dev: { disableDynamicRemoteTypeHints: true },
      remotes: {
        smartfarm_automations: {
          type: 'module',
          name: 'smartfarm_automations',
          entry: remoteEntry,
          entryGlobalName: 'smartfarm_automations',
          shareScope: 'default',
        },
      },
      shared: federationShared,
    }),
    react(),
  ],
}));
