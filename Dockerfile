FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
COPY tsconfig.base.json tsconfig.json ./

RUN npm ci

# Git-trigger metadata is absent when Railway restores an existing image.
# Retain the built source revision inside the artifact for restart/rollback.
ARG RAILWAY_GIT_COMMIT_SHA=dev
ENV RELEASE_SHA=${RAILWAY_GIT_COMMIT_SHA}
LABEL org.opencontainers.image.revision=${RAILWAY_GIT_COMMIT_SHA}

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
