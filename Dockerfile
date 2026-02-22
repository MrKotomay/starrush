FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
  NPM_CONFIG_FETCH_RETRIES=5 \
  NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
  NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
  NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
  NPM_CONFIG_FETCH_TIMEOUT=300000

WORKDIR /app

# Copy Prisma schema before install so @prisma/client postinstall can generate client code.
COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN set -eux; \
  for attempt in 1 2 3; do \
    npm ci --prefer-offline --no-audit --fund=false && break; \
    if [ "$attempt" = "3" ]; then \
      echo "npm ci failed after $attempt attempts"; \
      exit 1; \
    fi; \
    echo "npm ci failed (attempt $attempt), retrying..."; \
    sleep $((attempt * 15)); \
  done; \
  npx prisma generate

COPY . .

ARG NEXT_PUBLIC_WS_URL=
ARG NEXT_PUBLIC_GATEWAY_PORT=8081
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_GATEWAY_PORT=${NEXT_PUBLIC_GATEWAY_PORT}

RUN npm run build

EXPOSE 3000 8081

CMD ["npm", "run", "start"]
