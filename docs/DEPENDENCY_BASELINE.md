# Dependency baseline

Pin exact direct dependency versions. Do not treat `latest` ranges as the solution. Record peer warnings after `npm ci`.

## Toolchain observed 2026-09-17

| Tool | Version |
|---|---|
| Node | 24.21.0 local/CI; Vercel currently supplies 24.19.0 |
| npm | 11.19.0 local/CI; Vercel currently supplies 11.17.0 |

`package.json` `engines` allow Node `>=24.19.0 <25` and npm `>=11.17.0 <12` so hosted installs are not blocked on an exact patch. `.node-version` stays `24.21.0` for local and GitHub Actions.

## Selected runtime set

| Package | Version | Notes |
|---|---|---|
| react / react-dom | 19.3.0 | Fluent UI v9 peer range is `>=16.14.0 <20.0.0`. |
| @types/react / @types/react-dom | 19.3.0 | |
| vite | 8.3.0 | `@module-federation/vite` 1.22.0 supports Vite 5–8. |
| @vitejs/plugin-react | 6.1.1 | Requires Vite 8. |
| @fluentui/react-components | 9.74.7 | React 19 compatible. |
| @fluentui/react-icons | 2.0.341 | |
| @module-federation/vite | 1.22.0 | Official Vite federation plugin. |
| typescript | 5.9.3 | Pinned to 5.x; npm latest TypeScript 7 is outside `typescript-eslint` 8's `<6.1.0` peer range. |
| eslint | 9.39.5 | ESLint 10 exists but 9 is the proven match for this typescript-eslint pin. |
| vitest | 5.0.1 | |
| @playwright/test | 1.63.0 | |
| fastify | 5.12.5 | API process. |
| zod | 4.6.5 | Runtime contracts. |
| mqtt | 5.16.0 | Node-only. |
| pg | 8.23.0 | |
| node-pg-migrate | 9.0.0 | |
| react-router | 8.4.0 | |
| @tanstack/react-query | 5.103.1 | |

## G01 federation proof — 2026-09-17

Commands: `npm ci` (this workspace used `npm install` to create the lockfile), `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx playwright install chromium`, `npm run test:federation`.

Results:

- Typecheck and lint passed after pinning TypeScript 5.9.3 (TypeScript 7 is outside `typescript-eslint` 8's peer range).
- Unit tests: 15 passed before freshness extras; protocol parser/command tests included.
- Production builds used Vite 8.3.0 + `@module-federation/vite` 1.22.0.
- Remote artifact path: `apps/automations-remote/dist/remoteEntry.js` (not under `/assets`).
- Asset strategy: remote `base: './'` plus preview origin `http://127.0.0.1:4174`. Host pin `VITE_AUTOMATIONS_REMOTE_URL=http://127.0.0.1:4174/remoteEntry.js`.
- Playwright Chromium loaded the host on 4173, executed a remote React hook, opened a Fluent dialog, and delivered a host callback. Host All off remained visible.
- `npm ls` reported no unmet peer dependencies for the pinned set.
- npm warned that ESLint 9.39.5 is outside current ESLint version support; it remains pinned because typescript-eslint 8 accepts ESLint 9 and ESLint 10 was not required for G01.

Shared runtime: React 19.3.0, react-dom 19.3.0, react/jsx-runtime, and `@fluentui/react-components` as singletons. Fluent/Griffel produced large shared chunks; that is acceptable for the proof and will be watched for production budgets.
