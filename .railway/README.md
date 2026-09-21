# Staging API infrastructure

`railway.ts` manages only `default-service` in `smartfarm-staging`. It declares
Docker builds, readiness, one replica, no sleeping, restart-on-failure, the
pre-deploy migration, drain timeout, and simulator-only public variables.
Database, volume, backups and restores are outside this partial's scope.
Sensitive variables use `preserve()` and remain on Railway.

The npm lockfile pins SDK `railway@3.11.0`; this configuration was applied using
Railway CLI `5.58.0`. Run `npm ci` before using it. Root typecheck includes the file.

Link explicitly before planning or applying:

```sh
railway link --project 285fc6b3-caef-4e86-9a03-0966a2262b2b --environment 9229a204-ddea-466e-a906-438c5ed1e757 --service acac3d1f-1dc4-4f32-ba83-81a704167f31
railway config plan
railway config apply --yes
```

The provider environment is named `production`, but it belongs to the isolated
staging project and the application declares `APP_ENV=staging`.
Review the exact plan before applying. Do not add `--confirm-destructive`.
Do not use `--include-variables`, `--decrypt-variables`, or `--show-values` when
capturing evidence.

On Windows, SDK 3.11.0's version check needs `railway.exe` on PATH, not just the
npm `railway.cmd` shim. Add the installed CLI's `bin` directory to the current
shell's PATH. Do not modify SDK source or bypass its version check.

Known CLI 5.58.0 behavior: the imported graph omits default `sleepApplication=false`
and `restartPolicyType=ON_FAILURE`, so a subsequent plan repeats those two changes
even after a successful apply. The direct ServiceInstance API readback confirms
both values. Keep the explicit declarations; do not repeatedly apply solely to
chase this reporting difference, or ignore other plan changes. Evidence:
`docs/releases/staging-iac-2026-09-21.json`.

The direct service API reports builder RAILPACK even though the configuration
graph specifies DOCKERFILE. The applied deployment's build log explicitly loads
the Dockerfile; preserve that runtime evidence when verifying future releases.

The staging Git source is disconnected and intentionally absent from this partial.
The `smartfarm-web-staging` workflow owns source uploads after exact CI validation,
then deploys the immutable remote and host under one concurrency group. Do not
reconnect independent Git deploys. First coordinated-release qualification remains
pending; see `docs/RELEASE.md` for activation and evidence requirements.

Reference: https://docs.railway.com/infrastructure-as-code
