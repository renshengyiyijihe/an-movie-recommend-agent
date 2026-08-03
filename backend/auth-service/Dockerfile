FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY auth-service/package.json auth-service/pnpm-lock.yaml auth-service/tsconfig.json ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm-store

COPY auth-service/src ./src
COPY proto ./proto

RUN pnpm run build

EXPOSE 3002
EXPOSE 50051

CMD ["node", "dist/main.js"]
