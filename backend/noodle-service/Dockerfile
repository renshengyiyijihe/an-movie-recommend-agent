FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY noodle-service/.env ./
COPY noodle-service/package.json noodle-service/pnpm-lock.yaml noodle-service/tsconfig.json ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm-store

COPY noodle-service/src ./src
COPY noodle-service/proto ./proto

RUN pnpm run build

EXPOSE 3001

CMD ["node", "dist/main.js"]
