# ADR 001 — Persistent Railway service owns MQTT and automations

Status: accepted  
Date: 2026-09-17

## Decision

A single continuously running Node.js process on Railway owns the HiveMQ MQTT connection, command publishing, and automation engine. Vercel does not run MQTT. Browsers never receive broker credentials.

## Reason

Controller lifetime must outlive browser requests. One process is sufficient for one farm. Safe handover still uses a PostgreSQL advisory lock because Railway deploys can overlap.

## Consequences

- Railway sleeping must stay disabled.
- Closing a browser does not pause healthy automations.
- A new process always starts paused and requires explicit resume.
- Replica count is one; the lock is the overlap fence, not a device-level exclusive token.
