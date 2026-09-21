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

## Coordinated staging release

First complete ordered release: `79f128b`,
[workflow run 35626061921](https://github.com/mattiasli/TTSmartFarmWebApp/actions/runs/35626061921).
The recorded manifest is [staging-79f128b.json](releases/staging-79f128b.json).
S14 deployment ordering passed; fresh WebKit SameSite qualification remains S02.

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

Repository variable `STAGING_RELEASE_ENABLED=true` activates the workflow.
Railway's Git source is disconnected, and both app Vercel configs disable native
Git deployments. Preserve this single deployment authority. Vercel can still
record canceled/inactive Git deployments, which must not be mistaken for releases.
CLI deployments use explicit VERCEL_ORG_ID/VERCEL_PROJECT_ID; --scope tries to
load a user profile and fails for the configured tokens. Promotion uses the
project-scoped API directly and verifies the stable host deployment ID afterward.

These **environment secrets** are configured and verified under
[smartfarm-staging](https://github.com/mattiasli/TTSmartFarmWebApp/settings/environments):

| Secret | Required access |
| --- | --- |
| `RAILWAY_TOKEN` | Project token for project `285fc6b3-caef-4e86-9a03-0966a2262b2b`, environment `9229a204-ddea-466e-a906-438c5ed1e757` (UI name production; simulator staging) |
| `VERCEL_HOST_TOKEN` | Deploy/read/promote smartfarm-host in mattias-li-s-projects |
| `VERCEL_REMOTE_TOKEN` | Deploy/read smartfarm-automations in mattias-li-s-projects |
| `VERCEL_HOST_AUTOMATION_BYPASS` | Host project candidate protection bypass; prepared September 21 |
| `STAGING_SESSION_COOKIE` | Current staging admin app session only; prepared September 21; refresh when expired |

For credential rotation, create the Railway token under project Settings / Tokens
([official instructions](https://docs.railway.com/integrations/api)). Create Vercel
tokens in [account token settings](https://vercel.com/account/tokens), scoped to
the relevant projects if offered, otherwise the owning team
([official instructions](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token)).
Paste values directly into GitHub environment secrets, never chat or tracked files.

Each successful master CI run now triggers the release automatically. Manual
dispatch accepts an exact master-history SHA with successful CI. Leave simulator
controls idle during qualification: the workflow pauses automations and refuses
promotion if another request starts them. On failure inspect the stage evidence
and provider state before retrying; an observation timeout does not mean a
deployment stopped. Do not reconnect independent provider triggers.

Download `staging-release.json` from the successful workflow artifact to check a
subsequent release. Set `STAGING_RELEASE_MANIFEST` to that file's path before
running `check-staging-public.mjs` or `check-staging-authenticated.mjs --webkit`.
The checked-in `staging.json` is a recorded release snapshot, not a live pointer.
This avoids repeatedly committing manifests just to follow newly generated remote
URLs, and ensures the browser checks use the intended immutable remote.

Backup/restore is explicitly deferred and is not performed by the workflow.

## Rollback

P13 evidence: [staging acceptance](STAGING_ACCEPTANCE.md) and the
[deployment mapping](releases/staging.json). Fill missing deployment IDs from the
providers; a null value is not a release identifier. `npm run check:staging-public`
performs read-only anonymous proxy/remote checks and requires controller ownership.

Keep host and remote as a recorded pair. Backend rollback must match the expanded schema. Automations stay paused through rollback. Unresolved commands remain `uncertain` and are not replayed.
