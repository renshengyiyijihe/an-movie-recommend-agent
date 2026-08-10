FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY message-service/package.json message-service/tsconfig.json ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --store-dir /root/.cache/pnpm-store

COPY message-service/src ./src
COPY proto ./proto

RUN pnpm run build

EXPOSE 3003
EXPOSE 50052

CMD ["node", "dist/main.js"]
