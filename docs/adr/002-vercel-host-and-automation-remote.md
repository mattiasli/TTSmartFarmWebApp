# ADR 002 — Vercel static React host plus automation remote

Status: accepted  
Date: 2026-09-17

## Decision

`apps/dashboard` is the Module Federation host (`smartfarm_host`). `apps/automations-remote` is a separately built remote (`smartfarm_automations`) exposing `./AutomationPanel`. Both use `@module-federation/vite`. The host pins an immutable remote URL.

## Reason

The product requires a federated automation editor with a small boundary: the remote receives props and callbacks only. It does not own auth, MQTT, WebSocket, or authoritative farm state.

## Consequences

- Host and remote must share one React/Fluent singleton set.
- Remote asset paths and CORS must be proven with production builds on separate origins.
- If the remote fails to load, host sensors, manual controls, Pause, and All off remain available.
