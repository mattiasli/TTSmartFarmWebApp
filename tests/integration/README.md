PostgreSQL repository, auth, MQTT, and controller integration tests.

P05 PostgreSQL repository tests live in `repositories.test.ts`.

```text
npm run infra:up
npm run test:integration
```

Tests create disposable databases (`sf_p05_*`) and drop them afterwards. They skip with a clear failure if Docker Postgres is not reachable. P08 adds in-process loopback MQTT command confirmation and restart/no-replay coverage.
