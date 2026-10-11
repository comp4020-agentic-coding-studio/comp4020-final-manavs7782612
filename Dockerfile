# syntax = docker/dockerfile:1

# Builds and runs the actual Astro app (SSR, @astrojs/node standalone adapter).
# fly.toml fixes PORT=8080, one machine, and a volume at /data — DB_PATH below
# points the sqlite file there so the tally survives a restart or redeploy.

FROM node:24.21.0-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.21.0-slim AS run
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY README.md ./README.md

ENV DB_PATH=/data/tally.db
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "dist/server/entry.mjs"]
