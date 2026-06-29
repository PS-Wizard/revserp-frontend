FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS development-dependencies-env
COPY package.json bun.lock /app/
RUN bun install --frozen-lockfile || \
    (bun pm cache rm && bun install --frozen-lockfile) || \
    (bun pm cache rm && bun install --frozen-lockfile)

FROM base AS production-dependencies-env
COPY package.json bun.lock /app/
RUN bun install --frozen-lockfile --production || \
    (bun pm cache rm && bun install --frozen-lockfile --production) || \
    (bun pm cache rm && bun install --frozen-lockfile --production)

FROM base AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
RUN bun run build

# React Router's SSR server imports react-dom's renderToPipeableStream, which only
# exists under node's export condition (server.node.js). Bun would resolve react-dom/server
# to server.bun.js (renderToReadableStream only) and crash, so the runtime is node.
FROM node:22-alpine AS runtime
WORKDIR /app
COPY package.json bun.lock /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
CMD ["node", "./node_modules/.bin/react-router-serve", "./build/server/index.js"]
