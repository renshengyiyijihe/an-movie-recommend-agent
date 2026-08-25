FROM an-movie-packages AS packages
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY --from=packages /packages/contracts /packages/contracts
COPY client/package.json client/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.cache/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm-store

COPY client/ ./
ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm build

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
