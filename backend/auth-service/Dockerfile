FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY packages/contracts /packages/contracts
COPY packages/auth-client /packages/auth-client
COPY backend/auth-service/package.json backend/auth-service/pnpm-lock.yaml backend/auth-service/tsconfig.json ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm-store

COPY backend/auth-service/src ./src
COPY backend/proto ./proto

RUN pnpm run build

FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

ENV NODE_ENV=production

COPY --from=build /packages/contracts /packages/contracts
COPY --from=build /packages/auth-client /packages/auth-client
COPY backend/auth-service/package.json backend/auth-service/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir /root/.cache/pnpm-store

COPY --from=build /app/dist ./dist
COPY --from=build /app/proto ./proto

EXPOSE 3002
EXPOSE 50051

CMD ["node", "dist/main.js"]
