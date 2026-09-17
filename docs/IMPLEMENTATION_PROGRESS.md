# Implementation progress

Do not write secrets, broker passwords, OAuth client secrets, session tokens, or database URLs into this file.

## Session 2026-09-17

Source SHA / working-tree scope: local nested git in `smartFarmRemoteWebApp/` (HEAD `aca4fec` at session start). Dedicated GitHub remote: `https://github.com/mattiasli/TTSmartFarmWebApp`. Parent farm repository files were not modified.

Completed package IDs: P00, P01. P03 protocol parser/commands/settings/freshness/normalization tests are in place. P04 farm model started (in-memory, no MQTT broker yet).

Tests run and actual results:

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run test:unit` — 24 passed
- `npm run test:federation` — 1 passed (production host 4173 + remote 4174)

Built/deployed artifact identifiers: local only. Remote entry `apps/automations-remote/dist/remoteEntry.js`. Host `apps/dashboard/dist`.

Current environment mode and live-command flags: local simulator planned; `LIVE_COMMANDS_ENABLED` and `LIVE_PUMP_ENABLED` remain false for any live adapter.

Known limitations / failed gates: G00 and G01 passed locally. G02 hosted topology not executed. G03–G10 not executed. Previous physical pump freeze remains unresolved; live pumping stays disabled. GitHub remote URL is known; this folder's git has no `origin` until it is added and pushed.

Missing inputs (names only, never secret values): Railway/Vercel deployment access not required for local work. GitHub OAuth app not registered yet. GitHub push credentials were not used in this session.

Next concrete task and its prerequisite: finish remaining P03 protocol cases and local simulator (P04). Hosted P02 waits on Vercel/Railway access.

### P00 notes

- Inspected this folder's git: dedicated `.git`, branch `master`, initial commit `aca4fec` containing the implementation plan and credential templates. `private-setup/` is ignored.
- Parent farm working tree remains dirty with firmware/desktop automation work. Those files are out of scope and were not changed.
- Firmware evidence re-checked from working tree: topics `smartfarm/telemetry` and `smartfarm/cmd/#`, 800 ms telemetry, 22-field guard extension present, pump pulse + 4 s firmware cap, 400 ms beep, rain at `steam >= 800`.
- Desktop protocol freshness remains 4 s. Command allowlist and LCD ASCII rules match `SmartFarmRemote3D/electron/protocol.cjs`.
- GitHub bootstrap username `mattiasli` resolves to public numeric id `43301236`.
- All generated project files stay inside `smartFarmRemoteWebApp/`. GitHub workflows will live in this folder's `.github/workflows` because this directory is the web app repository root.
