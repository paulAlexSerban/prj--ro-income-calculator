FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY packages/engine packages/engine
COPY web web
RUN npm run build -w web

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
