# Noodle Recommendation Agent

## 项目结构

- backend/: NestJS 后端，提供泡面推荐接口
- client/: React 前端，提供聊天页面

## 后端

- 入口: `backend/src/main.ts`
- 统一模型入口: `backend/src/model/model.provider.ts`
- 推荐逻辑: `backend/src/noodle/noodle.service.ts`
- 无数据库、无队列、无 Redis

## 前端

- 入口: `client/src/main.tsx`
- 聊天页面: `client/src/App.tsx`
- 样式: `client/src/styles.css`

## 运行

### 启动全部服务

```bash
docker compose up -d --build
```

### 访问 Portainer

启动后，可通过以下地址访问 Portainer 管理界面：

```text
http://你的服务器IP:9000
```

首次登录时需要创建管理员账号。

1. 安装依赖

   cd backend
   pnpm install

   cd ../client
   pnpm install

2. 启动后端

   cd backend
   pnpm run start:dev

3. 启动前端

   cd client
   pnpm run dev

## 配置

后端可通过环境变量配置模型

- `OPENAI_API_KEY` 或 `NVIDIA_API_KEY`
- `NVIDIA_MODEL` 默认 `gpt-4o-mini`
- `NVIDIA_BASE_URL` 默认 `https://api.openai.com/v1`

如果没有可用模型，系统会返回兜底推荐。