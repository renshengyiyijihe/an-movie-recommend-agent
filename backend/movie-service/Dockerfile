FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY movie-service/package.json movie-service/pnpm-lock.yaml movie-service/tsconfig.json ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm-store

COPY movie-service/src ./src
COPY proto ./proto

RUN pnpm run build

EXPOSE 3001

# CMD ["node", "dist/main.js"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
