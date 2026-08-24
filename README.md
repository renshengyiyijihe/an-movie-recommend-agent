# An-movie Agent

自然语言电影推荐系统。用户描述类型、心情、演员、时长、评分等偏好，后端用 LLM 做意图识别与任务规划，再通过 TMDB 工具检索，返回结构化推荐。

## 核心能力

- 文本聊天式电影推荐（须登录，JWT 鉴权）
- 多会话：创建、列表、拉取历史气泡
- 意图分类：域内继续规划，域外直接拒绝
- 任务规划后按需走 **Search**（TMDB 工具）或 **Relation**（人物/影片集合运算）
- 结构化回复：说明文本 + 电影海报卡片
- 推荐摘要写入 Milvus，供后续相似上下文检索

前端可上传图片（Data URL），当前 Orchestrator **尚未消费** `imageData`，预览只留在输入区。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18、Vite、MUI 9、Zustand |
| 后端 | 三个独立 NestJS 10 服务 |
| 数据 | PostgreSQL、Milvus |
| LLM / Embedding | LangChain（OpenAI 兼容）+ SiliconFlow |
| 影片数据 | TMDB |
| 包管理 | pnpm 10.15.0（无根级 `package.json`） |

## 系统架构

```text
浏览器
  └─ client (nginx:80)
       /api/auth/*    → auth-service:3002
       /api/movie/*   → movie-service:3001
       /api/message/* → message-service:3003

movie-service  ──gRPC──► auth-service:50051     ValidateToken
movie-service  ──gRPC──► message-service:50052  会话 / 相似上下文
message-service ──gRPC──► auth-service:50051
message-service ──HTTP──► SiliconFlow embeddings
movie-service   ──HTTP──► SiliconFlow LLM + TMDB
message-service ──► Postgres + Milvus(19530)
auth-service    ──► Postgres
```

推荐主链路：`HomePage` `POST /api/movie/recommend`（`message`、可选 `imageData` / `conversationId`，Header `Authorization: Bearer <jwt>`）→ `MovieService.recommend()` 保证会话与轮次 → `OrchestratorAgent` → `CompleteTurn` 写入助手气泡，HTTP `data` 与写入 payload 同一份。

## Agent 工作流

```text
OrchestratorAgent
  ├─ classifyIntent     → in_scope | out_of_scope | unknown
  ├─ planTask           → TaskPlan { agents, relation? }
  ├─ executeAgentPlan   → SearchAgent 和/或 RelationAgent
  ├─ fallbackSearch     → Relation 失败且本轮未跑 Search 时补一次
  └─ synthesizeResults  → LLM 把证据视图整理成 { text, movies }
        ├─ SearchAgent   → LLM 规划 1–4 个 TMDB tool_calls
        └─ RelationAgent → 按规划做 discover / compute，不另调 LLM
```

- `out_of_scope` / `unknown` 立即短路，不进入检索。
- Tool 完整结果进本轮内存工作副本（`WorkingSet`），汇总只看精简视图。
- 已注册工具：`movie_search`、`movie_discover`、`movie_detail`、`person_search`、`person_detail`。

## 仓库结构

```text
an-movie-agent/
├── client/                       # Vite + React 单页
├── backend/
│   ├── proto/                    # 跨服务 .proto（构建时 COPY 进镜像）
│   ├── auth-service/             # 注册登录 + JWT + gRPC 验票
│   ├── movie-service/            # 推荐工作流 / Agent / TMDB
│   └── message-service/          # 会话消息 + Milvus 相似上下文
├── docker-compose.yml
├── .github/workflows/deploy.yml  # push main 后 SSH 部署
└── AGENTS.md                     # 编码约定与模块边界
```

三个后端服务和前端各自独立安装依赖。

### 服务职责

| 服务 | HTTP | 职责 |
| --- | --- | --- |
| **auth-service** | `:3002` | `POST /auth/register`、`POST /auth/login`；gRPC `ValidateToken`（`:50051`） |
| **movie-service** | `:3001` | `POST /movie/recommend`（强制登录）；编排 Agent、调 TMDB |
| **message-service** | `:3003` | 会话 REST；gRPC 轮次/事件；Postgres + Milvus |

movie → message 的身份走 gRPC metadata `user-id`，请求体不传 `user_id`。只允许会话主人读写。

## 快速运行

先准备环境文件（不要提交 `.env`）：

- `backend/.env`：auth / message 共用（至少 `JWT_SECRET`）
- `backend/movie-service/.env`：至少 `LLM_API_KEY`、`TMDB_API_KEY`

然后：

```bash
docker compose up --build
```

| 入口 | 地址 |
| --- | --- |
| 前端 | http://localhost |
| movie-service | http://localhost:3001 |
| auth-service | http://localhost:3002 |
| message-service | http://localhost:3003 |
| Portainer | http://localhost:9000 |

本地单独跑 Vite（`http://localhost:5173`）时，默认 **没有** 把 `/api` 转到后端，需要自行配代理。Docker 下由 nginx 反代；movie / message 代理超时 300s，与前端 axios 5 分钟超时对齐。

## 环境变量

**`backend/.env`（auth-service / message-service）**

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | 必填，缺失则 auth-service 拒绝启动 |
| `JWT_EXPIRES_IN` | 默认 `7d` |
| `POSTGRES_URL` | Compose 会覆盖为容器内 Postgres |
| `AUTH_HTTP_PORT` / `AUTH_GRPC_BIND` | 默认 `3002` / `0.0.0.0:50051` |
| `PORT` / `MESSAGE_GRPC_PORT` | message-service，默认 `3003` / `50052` |
| `AUTH_GRPC_ADDRESS` / `MILVUS_URL` | Compose 注入 |
| `SILICONFLOW_API_KEY` | embedding；失败不阻断主流程 |
| `SILICONFLOW_BASE_URL` | 默认 `https://api.siliconflow.cn/v1` |
| `SILICONFLOW_EMBEDDING_MODEL` | 默认 `BAAI/bge-m3` |

**`backend/movie-service/.env`**

| 变量 | 说明 |
| --- | --- |
| `LLM_API_KEY` | 必填 |
| `LLM_BASE_URL` | 默认 `https://api.siliconflow.cn/v1` |
| `MODEL_NAME` | 默认 `deepseek-ai/DeepSeek-V4-Flash` |
| `MODEL_TEMPERATURE` | 默认 `0.3` |
| `TMDB_API_KEY` / `TMDB_API_URL` | 影片检索 |
| `PORT` | 默认 `3001` |
| `AUTH_GRPC_ADDRESS` / `MESSAGE_GRPC_ADDRESS` | Compose 注入 |

## HTTP API（经 nginx 前缀 `/api`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | 注册（username 2–50，password 6–128） |
| `POST` | `/api/auth/login` | 登录，返回 JWT |
| `POST` | `/api/movie/recommend` | 推荐（需 Bearer） |
| `POST` | `/api/message/conversations` | 新建会话 |
| `GET` | `/api/message/conversations` | 会话列表 |
| `GET` | `/api/message/conversations/:id` | 会话详情（扁平 `ChatItem`） |

聊天气泡：`role` 为 `user` \| `assistant`；`kind` 为 `user_query` \| `recommendation` \| `reject` \| `error`。成功推荐的可见字段是 `text` + `movies`。

## 前端

单页应用，路由只有 `/`。登录态存在 `localStorage`。发送推荐前必须登录，后端无 token 或验票失败返回 `401`，前端弹出登录框。

## 部署

push `main` 后由 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) SSH 部署。需配置 GitHub secret `LLM_API_KEY`（以及可选 `LLM_BASE_URL`）。

## 开发约定

模块边界、Agent / Tool / Prompt 扩展方式见 [AGENTS.md](AGENTS.md)。
