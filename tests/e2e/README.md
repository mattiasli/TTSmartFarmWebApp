Browser smoke against the local dashboard (`http://127.0.0.1:5173`).

```text
npm run dev
npm run test:e2e
```

CI uses `node tools/scripts/run-e2e-test.mjs`, which starts `npm run dev` then Playwright. Live pump stays disabled.
# P13 recovery coverage

Run `node tools/scripts/run-e2e-test.mjs` for the isolated local stack and all six
browser tests. The suite covers simulator control, remote failure/retry with usable
host stops, concurrent settings saves, real 409 rejection, and draft preservation.
It uses separate local sessions rather than GitHub OAuth. Hosted checks and results
are tracked in `docs/STAGING_ACCEPTANCE.md`.
