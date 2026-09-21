# Release and CI notes

Validation CI does not receive provider or farm secrets. The separate staging
release workflow uses encrypted deployment and app-session secrets in the
`smartfarm-staging` GitHub environment. Live pump stays disabled.

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

Staging project names/URLs are recorded in [deployment notes](DEPLOYMENT.md).
Do not add deploy tokens to repository files.

## Coordinated staging release (prepared, not yet activated)

`.github/workflows/smartfarm-web-staging.yml` validates the exact master revision
against all five successful CI jobs, then runs `tools/scripts/release-staging.mjs`.
It deploys and verifies the API, deploys and imports the immutable remote, builds
the host against that remote, tests the candidate, and promotes the host. The
candidate browser uses the stable app origin while fetching candidate assets and
API proxy responses with a project automation-bypass header. Existing app-session
checks do not replace fresh OAuth qualification. Release evidence, including the
previous compatible deployment pair and stage outcomes, is uploaded as an artifact.
CLI API uploads bake the verified checkout SHA into the Docker image so restarts
and rollbacks retain artifact identity without Git-trigger metadata.

The workflow remains disabled until repository variable `STAGING_RELEASE_ENABLED`
equals `true`. Current native provider deployments remain connected. S14 is not
passed until the coordinated workflow actually completes on a verified revision.

Prepare these **environment secrets** under
[smartfarm-staging](https://github.com/mattiasli/TTSmartFarmWebApp/settings/environments):

| Secret | Required access |
| --- | --- |
| `RAILWAY_TOKEN` | Project token for project `285fc6b3-caef-4e86-9a03-0966a2262b2b`, environment `9229a204-ddea-466e-a906-438c5ed1e757` (UI name production; simulator staging) |
| `VERCEL_HOST_TOKEN` | Deploy/read/promote smartfarm-host in mattias-li-s-projects |
| `VERCEL_REMOTE_TOKEN` | Deploy/read smartfarm-automations in mattias-li-s-projects |
| `VERCEL_HOST_AUTOMATION_BYPASS` | Host project candidate protection bypass; prepared September 21 |
| `STAGING_SESSION_COOKIE` | Current staging admin app session only; prepared September 21; refresh when expired |

Railway project-token creation returned `Not Authorized` through the signed-in
CLI. Vercel token creation also failed; its exact provider cause is not yet
established. Existing login access is insufficient to conclude CI credentials are
available. Create the Railway token under project Settings / Tokens
([official instructions](https://docs.railway.com/integrations/api)). Create Vercel
tokens in [account token settings](https://vercel.com/account/tokens), scoped to
the relevant projects if offered, otherwise the owning team
([official instructions](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token)).
Paste values directly into GitHub environment secrets, never chat or tracked files.

Activation sequence, after credentials are available:

1. Commit `git.deploymentEnabled: false` in both app Vercel configs and remove
   the GitHub source declaration/import from API IaC. These changes are still
   pending; the release preflight rejects the current Vercel configuration.
2. Disconnect only the staging API's native Git source and verify its deployment
   triggers are empty. Preserve running services, database, variables and volumes.
3. Wait for successful CI on the activation revision; enable the repository
   variable and dispatch that exact SHA. Do not allow competing native deploys.
4. Inspect the release artifact and hosted results. On failure, inspect provider
   state before retrying; a failed observer is not proof a deployment stopped.

Backup/restore is explicitly deferred and is not performed by the workflow.

## Rollback

P13 evidence: [staging acceptance](STAGING_ACCEPTANCE.md) and the
[deployment mapping](releases/staging.json). Fill missing deployment IDs from the
providers; a null value is not a release identifier. `npm run check:staging-public`
performs read-only anonymous proxy/remote checks and requires controller ownership.

Keep host and remote as a recorded pair. Backend rollback must match the expanded schema. Automations stay paused through rollback. Unresolved commands remain `uncertain` and are not replayed.
