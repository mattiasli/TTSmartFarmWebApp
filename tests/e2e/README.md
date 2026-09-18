Browser smoke against the local dashboard (`http://127.0.0.1:5173`).

```text
npm run dev
npm run test:e2e
```

CI uses `node tools/scripts/run-e2e-test.mjs`, which starts `npm run dev` then Playwright. Live pump stays disabled.
