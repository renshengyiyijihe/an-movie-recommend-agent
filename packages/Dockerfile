FROM node:24-alpine

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
