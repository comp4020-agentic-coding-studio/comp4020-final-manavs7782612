# syntax = docker/dockerfile:1

# No dependencies to install: node 24 runs the TypeScript directly (type
# stripping) and brings its own SQLite. The database lives on the /data volume.
FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
COPY src/ src/
COPY public/ public/
COPY README.md ./
ENV DB_PATH=/data/game.db NODE_ENV=production
CMD ["node", "src/server.ts"]
