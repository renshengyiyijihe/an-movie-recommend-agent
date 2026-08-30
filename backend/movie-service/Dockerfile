# Name-only FROM becomes docker.io/library/… and the deploy-host mirror 403s it.
ARG PACKAGES_IMAGE=an-movie-packages
FROM ${PACKAGES_IMAGE} AS packages
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
