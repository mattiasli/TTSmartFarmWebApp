# Release and CI notes

CI does not receive HiveMQ, Railway, Vercel, or GitHub OAuth secrets. Live pump stays disabled.

## Local script contract

```text
npm ci
npm run infra:up
npm run db:migrate
npm run db:seed:local
npm run dev
npm run simulator -- --scenario normal
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:federation
npm run test:e2e
npm run check:client-secrets
npm run check:contracts
npm run check:frontend-imports
npm run infra:down
```

`infra:down` keeps Docker volumes. `test:federation` builds host/remote and serves them on 4173/4174. `test:e2e` expects the dashboard already running unless you use `node tools/scripts/run-e2e-test.mjs`.

## CI

`.github/workflows/smartfarm-web-ci.yml` runs lint/types/unit, Postgres-backed integration, built federation, frontend secret/import scans, and Chromium e2e against `npm run dev`. No production broker credential is present.

Staging project names/URLs are recorded in [docs/DEPLOYMENT.md](DEPLOYMENT.md). GitHub Actions still does not receive Railway/Vercel/OAuth secrets; first staging deploys are dashboard-triggered. Do not add deploy tokens to this repository.

## Rollback

Keep host and remote as a recorded pair. Backend rollback must match the expanded schema. Automations stay paused through rollback. Unresolved commands remain `uncertain` and are not replayed.
