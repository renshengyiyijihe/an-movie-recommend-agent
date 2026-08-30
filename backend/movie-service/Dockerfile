# Do not FROM a local image (name or sha256:…). BuildKit rewrites both to
# docker.io/library/… and the deploy-host mirror 403s unofficial names.
FROM node:24-alpine AS packages

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY packages/contracts/package.json packages/contracts/pnpm-lock.yaml packages/contracts/tsconfig.json /packages/contracts/
COPY packages/contracts/src /packages/contracts/src
COPY packages/auth-client/package.json packages/auth-client/pnpm-lock.yaml packages/auth-client/tsconfig.json /packages/auth-client/
COPY packages/auth-client/src /packages/auth-client/src

RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm --dir /packages/contracts install --frozen-lockfile --store-dir /root/.cache/pnpm-store \
    && pnpm --dir /packages/contracts build \
    && pnpm --dir /packages/auth-client install --frozen-lockfile --store-dir /root/.cache/pnpm-store \
    && pnpm --dir /packages/auth-client build \
    && rm -rf /packages/contracts/node_modules /packages/auth-client/node_modules

FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY --from=packages /packages/contracts /packages/contracts
COPY --from=packages /packages/auth-client /packages/auth-client
COPY backend/movie-service/package.json backend/movie-service/pnpm-lock.yaml backend/movie-service/tsconfig.json backend/movie-service/nest-cli.json ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm-store

COPY backend/movie-service/src ./src
COPY backend/proto ./proto

RUN pnpm run build

FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

ENV NODE_ENV=production

COPY --from=build /packages/contracts /packages/contracts
COPY --from=build /packages/auth-client /packages/auth-client
COPY backend/movie-service/package.json backend/movie-service/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir /root/.cache/pnpm-store

COPY --from=build /app/dist ./dist
COPY --from=build /app/proto ./proto

EXPOSE 3001

CMD ["node", "--enable-source-maps", "dist/main.js"]
