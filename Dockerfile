FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
COPY tsconfig.base.json tsconfig.json ./

RUN npm ci

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@smartfarm/api"]
