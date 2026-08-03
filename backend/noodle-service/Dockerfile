FROM node:24-alpine

WORKDIR /app

COPY noodle-service/package.json noodle-service/tsconfig.json ./
RUN npm install

COPY noodle-service/src ./src
COPY proto ./proto

RUN npm run build

EXPOSE 3001

CMD ["node", "dist/main.js"]
