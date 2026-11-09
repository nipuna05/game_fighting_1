# The multiplayer game server only (no website, no art): the shared game rules + the WebSocket server.
FROM node:20-slim
WORKDIR /app
# install only what the server needs (the lockfile covers the whole repo, so every workspace's package.json is present)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace=server --workspace=shared --include-workspace-root --omit=dev
COPY shared shared
COPY server server
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/src/index.ts"]
