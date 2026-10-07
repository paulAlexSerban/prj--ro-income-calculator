FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY packages/engine packages/engine
COPY api api
COPY db db
EXPOSE 3000
CMD ["npx", "tsx", "api/src/index.ts"]
