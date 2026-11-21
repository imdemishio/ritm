FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
