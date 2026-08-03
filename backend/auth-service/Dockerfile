FROM node:24-alpine

WORKDIR /app

COPY auth-service/package.json auth-service/tsconfig.json ./
RUN npm install

COPY auth-service/src ./src
COPY proto ./proto

RUN npm run build

EXPOSE 3002
EXPOSE 50051

CMD ["node", "dist/main.js"]
