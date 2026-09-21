import { defineRailway, github, preserve, project, service } from "railway/iac";
import type { DeployConfig } from "railway/iac";

// Own only the existing staging API. Database and volume are managed separately.
export const partial = "smartfarm-api";

export default defineRailway(() => {
  // The CLI importer/engine supports this field; SDK 3.11.0 omits its type.
  const deploy: DeployConfig & { preDeployTimeoutSeconds: number } = {
    drainingSeconds: 15, preDeployTimeoutSeconds: 120,
    sleepApplication: false, restartPolicyType: "ON_FAILURE",
  };
  const defaultService = service("default-service", {
    source: github("mattiasli/TTSmartFarmWebApp", { branch: "master", checkSuites: true }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 30,
    preDeploy: "npm run db:migrate",
    replicas: { "sfo": 1 },
    deploy,
    env: {
      APP_ENV: "staging",
      FARM_MODE: "simulator",
      SIMULATOR_TRANSPORT: "memory",
      LIVE_COMMANDS_ENABLED: "false",
      LIVE_PUMP_ENABLED: "false",
      NODE_ENV: "production",
      PORT: "3001",
      ALLOWED_BROWSER_ORIGINS: "https://smartfarm-host.vercel.app",
      PUBLIC_APP_ORIGIN: "https://smartfarm-host.vercel.app",
      PUBLIC_WS_URL: "wss://default-service-production.up.railway.app/ws",
      BOOTSTRAP_ADMIN_GITHUB_ID: preserve(),
      BOOTSTRAP_ADMIN_USERNAME: preserve(),
      DATABASE_URL: preserve(),
      GITHUB_OAUTH_CLIENT_ID: preserve(),
      GITHUB_OAUTH_CLIENT_SECRET: preserve(),
    },
  });

  return project("smartfarm-staging", {
    resources: [defaultService],
  });
});
