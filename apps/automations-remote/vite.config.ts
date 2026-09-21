import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { federationShared } from '../../tools/scripts/federation-shared.mjs';

const publicOrigin = process.env.VITE_REMOTE_PUBLIC_ORIGIN ?? 'http://127.0.0.1:5174';

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_RELEASE_SHA': JSON.stringify(
      process.env.VITE_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    ),
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    origin: publicOrigin,
    cors: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    cors: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    federation({
      name: 'smartfarm_automations',
      filename: 'remoteEntry.js',
      dts: false,
      dev: { disableDynamicRemoteTypeHints: true },
      exposes: {
        './AutomationPanel': './src/expose.ts',
      },
      shared: federationShared,
    }),
    react(),
  ],
});
