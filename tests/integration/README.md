P05 PostgreSQL repository tests live in `repositories.test.ts`.

```text
npm run infra:up
npm run test:integration
```

Tests create disposable databases (`sf_p05_*`) and drop them afterwards. They skip with a clear failure if Docker Postgres is not reachable. Local MQTT command tests remain P07/P08.
