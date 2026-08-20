# An-movie Agent 指南

面向后续对话的项目地图与编码约定。改代码前先对齐这里的职责边界，不要把逻辑塞回已经拆出去的模块。

## 项目是什么

自然语言电影推荐系统。用户描述类型、心情、演员、时长、评分等偏好（前端还可上传图片），后端用 LLM 做意图识别与任务规划，再通过 TMDB 工具检索，返回结构化推荐。

技术栈：React 18 + Vite 前端；三个独立 NestJS 10 服务；PostgreSQL；Milvus 向量检索；LangChain / SiliconFlow；TMDB。包管理器统一为 **pnpm 10.15.0**。

## 仓库结构

```text
an-movie-agent/
├── client/                      # 前端（Vite + React）
├── backend/
│   ├── proto/                   # 跨服务共享 .proto（构建时 COPY 进各镜像）
│   ├── auth-service/            # 注册登录 + JWT + gRPC 验票
│   ├── movie-service/           # 推荐工作流 / Agent / TMDB
│   └── message-service/         # 会话消息 + Milvus 相似上下文
├── docker-compose.yml
└── .github/workflows/deploy.yml # push main 后 SSH 部署到阿里云
```

没有根级 package.json，三个后端服务和前端各自独立安装依赖。

## 运行时拓扑

```text
浏览器
  └─ client(nginx:80)
       /api/auth/*    → auth-service:3002
       /api/movie/*   → movie-service:3001
       /api/message/* → message-service:3003

movie-service ──gRPC──► auth-service:50051   ValidateToken
movie-service ──gRPC──► message-service:50052 会话/相似上下文
message-service ──gRPC──► auth-service:50051
message-service ──HTTP──► SiliconFlow embeddings
movie-service  ──HTTP──► SiliconFlow LLM + TMDB
message-service ──► Postgres + Milvus(19530)
auth-service    ──► Postgres
```

本地一键：`docker compose up --build`

| 入口 | 地址 |
| --- | --- |
| 前端 | http://localhost |
| 开发前端（非 Docker） | http://localhost:5173（需自行配代理） |
| movie-service | http://localhost:3001 |
| auth-service | http://localhost:3002 |
| message-service | http://localhost:3003 |
| Portainer | http://localhost:9000 |

## 推荐主链路（改这里前先读）

1. 前端 `HomePage` `POST /api/movie/recommend`，带 `message`、可选 `imageData`、`conversationId`，Header `Authorization: Bearer <jwt>`。
2. `MovieController` → `MovieService.recommend()`：
   - 可选 gRPC 验票；无 token 仍可继续，但会话 `user_id` 为空。
   - `ensureConversation` / `loadConversationHistory`（Milvus 相似检索，limit=5）/ 追加 user 消息。
   - 调用 `OrchestratorAgent.orchestrate(model, query, history)`。
3. Orchestrator：意图分类 → 任务规划 → 按 plan 执行 Agent → 字符串拼接汇总。
4. 域外（`out_of_scope`）返回 `{ type: "reject" }`；成功则 `parseRecommendation()` 解析 JSON 后 `{ type: "success", data, conversationId }`。

**当前缺口：** Orchestrator 的 `synthesizeResults()` 只拼接 Agent 字符串，不会再调 LLM 生成推荐 JSON。`SearchAgent` 返回的是 tool 调用结果 JSON。`MovieService.parseRecommendation()` 期望顶层有 `recommendations` / `explanation` / `preferences`。若模型未把工具结果整理成该格式，前端会拿到空推荐。改推荐质量时优先补「工具结果 → 最终 JSON」这一步，而不是把逻辑写回 `movie.service.ts`。

## 后端服务

### auth-service

- HTTP：`POST /auth/register`、`POST /auth/login`，DTO 校验（username 2–50，password 6–128）。
- 启动时 `CREATE TABLE IF NOT EXISTS users`。
- gRPC `Auth.ValidateToken`（`backend/proto/auth.proto`）。
- JWT：`JWT_SECRET`、`JWT_EXPIRES_IN`（默认 7d）。
- **硬编码白名单：** `validateToken()` 只放行 `1191681452@qq.com`。改鉴权策略时不要忽略这一点。
- 代码里 Postgres 默认 URL 是 `noodledb`，Compose 实际库名是 `anmovie_db`，本地非 Docker 启动必须设 `POSTGRES_URL`。

### movie-service

职责分层（保持这个边界）：

| 层 | 路径 | 做什么 |
| --- | --- | --- |
| HTTP 入口 | `movie/movie.controller.ts` | 仅 `/movie/recommend` |
| 编排门面 | `movie/movie.service.ts` | 鉴权、会话、调 Orchestrator、解析响应 |
| Agent | `movie/agents/` | 意图、规划、搜索、关系 |
| Tools | `movie/agents/tools/` | 封装 TMDB |
| Prompt | `movie/services/prompt-template.service.ts` | 所有 LLM 提示词 |
| 模型 | `model/model.provider.ts` | LangChain `ChatOpenAI` 兼容 SiliconFlow |
| TMDB | `model/tmdb.provider.ts` | HTTP 客户端 + 参数校验 |
| 辅助 | `movie/helpers.ts`、`movie/constants.ts`、`movie/types.ts` | 重试、JSON 解析、类型/常量 |

LLM：优先 `SILICONFLOW_API_KEY`，否则 `OPENAI_API_KEY`。默认 `SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`，默认模型 `deepseek-ai/DeepSeek-V4-Flash`。每次 `invoke` 前 `sleep(1000)`。

`LangSmithProvider` 存在，但当前 `ModelProvider` 未接入追踪。部署脚本仍写 `NVIDIA_API_KEY`，与代码读取的 SiliconFlow/OpenAI 变量不一致。

`MovieSearchService`、`RelationAnalysisService` 已在 `ServicesModule` 注册，**没有被 Agent / MovieService 引用**。关系逻辑目前写在 `RelationAgent` 内部且未完成。不要平行再实现一套。

`REFACTORING_PLAN.md` 过时（当时 `movie.service.ts` ~1700 行，现约 380 行），不要按其步骤改。

### message-service

- REST（需 JWT）：`POST /message/conversations`、`GET /message/conversations`、`GET /message/conversations/:id`。
- gRPC：`CreateConversation`、`AppendMessage`、`GetConversation`、`SearchSimilarContext`。
- TypeORM `synchronize: true`，表 `conversations` / `messages`。
- `GetConversation` 只返回 `message_type IN ('user_query', 'final_response')`。
- 有 `summary` 时异步写入 Milvus collection `message_summary_embeddings`（维度 1024，embedding 默认 `BAAI/bge-m3`）。Milvus 失败不阻断主流程。
- 启动会轮询等待 Milvus healthy。

## Agent 系统

```text
OrchestratorAgent
  ├─ classifyIntent     → in_scope | out_of_scope | unknown
  ├─ planTask           → AgentType[]  目前仅 "search" | "relation"
  ├─ executeAgentPlan   → 按注册表顺序执行
  └─ synthesizeResults  → 拼接成功结果字符串
        ├─ SearchAgent  → LLM 规划 tool_calls（1–4 个）→ ToolsRegistry.execute
        └─ RelationAgent → 分析实体/关系 → 调 SearchAgent → 关系运算（未完成）
```

已注册 Tools（`ToolsRegistry`）：

- `movie_search` — TMDB `/search/movie`
- `movie_discover` — TMDB `/discover/movie`
- `movie_detail` — TMDB `/movie/{id}`
- `person_search` — TMDB `/search/person`
- `person_detail` — TMDB `/person/{id}`

所有 Tool 实现 `ITool`（`name` / `description` / `schema` / `execute`），结果统一 `ToolResult`。公共参数 schema 在 `tools/common.ts`。

Prompt 入口（改提示词只动这个文件）：

- `getSystemPrompt`
- `getPreferenceExtractionPrompt`
- `getIntentClassificationPrompt`
- `getTaskPlanningPrompt`
- `getSearchToolPlanningPrompt`（会注入实时 tool schema）

`SearchAgent` 用 Zod 校验计划，再按各 tool 的 JSON Schema 校验参数；失败走 `executeWithRetry`（`MAX_RETRIES=3`）。

**RelationAgent 现状：** `analyzeRelationQuery` 是关键字启发式且实体列表常为空；`processRelation` 返回占位字符串。不要在未接 LLM/NER 前把它当可用能力宣传。

## 前端

- 单页：`client/src/pages/HomePage`。路由只有 `/`。
- 状态：Zustand `store/auth.ts`，token 存 `localStorage`。
- HTTP：`api.ts` 的 `request()` 自动带 Bearer；`baseURL: '/'`。Docker 下由 nginx 反代；本地 `vite` 默认 **没有** 把 `/api` 转到后端。
- 组件：`TopBar`、`AuthModal`、`ConfigModal`（会话列表）、`RecommendationPoster`。样式用 Less CSS Modules。
- 同时依赖 Mantine 7 与 MUI 9，新增 UI 优先复用现有组件，不要再引入第三套库。
- 发送推荐前必须登录。图片以 Data URL 传 `imageData`，**后端 Orchestrator 当前未使用图片**。
- nginx 对 movie/message 代理超时 300s，与 axios timeout 5min 对齐。

## 环境变量（不要提交 .env）

**auth-service / 共用 `backend/.env`**

- `JWT_SECRET`、`JWT_EXPIRES_IN`
- `POSTGRES_URL`
- `AUTH_HTTP_PORT`（3002）、`AUTH_GRPC_BIND`（`0.0.0.0:50051`）

**movie-service（`backend/movie-service/.env`）**

- `PORT`（3001）
- `SILICONFLOW_API_KEY` 或 `OPENAI_API_KEY`
- `SILICONFLOW_BASE_URL`、`MODEL_NAME`、`MODEL_TEMPERATURE`
- `TMDB_API_KEY`、`TMDB_API_URL`
- `AUTH_GRPC_ADDRESS`、`MESSAGE_GRPC_ADDRESS`
- 可选：`LANGSMITH_API_KEY`、`LANGSMITH_TRACING`、`LANGSMITH_PROJECT`

**message-service**

- `PORT`（3003）、`MESSAGE_GRPC_PORT`（50052）
- `POSTGRES_URL`、`AUTH_GRPC_ADDRESS`、`MILVUS_URL`
- `SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_EMBEDDING_MODEL`

## 编码约定

- 语言：TypeScript。后端 NestJS injectable；前端函数组件。
- 新增 **Agent**：扩展 `AGENT_TYPES`，在 `OrchestratorAgent` 的 `agentExecutors` 注册，不要改执行循环本身。
- 新增 **Tool**：实现 `ITool`，在 `ToolsRegistry.registerTools()` 注册。SearchAgent 会自动拿到 schema，不要在 Agent 里再写一份参数定义。
- 新增 / 修改 **Prompt**：只改 `PromptTemplateService`。
- 通用文本、JSON、重试：用 `helpers.ts`，不要在 service 里再实现一遍。
- 类型、genre/language 映射：用 `types.ts` / `constants.ts`。
- LLM 结构化输出必须可被 `tryParseJson` 解析；对外推荐响应保持 `recommendations` + `explanation` + `preferences`。
- 跨服务契约先改 `backend/proto/*.proto`，再改 client/server 实现。
- 日志用 `Logger`，关键路径已有 `query` / `intent` / `tool` 日志，保持同风格。
- 不要提交 `.env`、密钥、`node_modules`、`dist`。
- 用户要求用简体中文回复；代码标识符保持英文。

## 改动时优先读的文件

| 目的 | 文件 |
| --- | --- |
| 推荐入口与会话 | `backend/movie-service/src/movie/movie.service.ts` |
| 意图与调度 | `backend/movie-service/src/movie/agents/orchestrator.agent.ts` |
| 工具规划与执行 | `backend/movie-service/src/movie/agents/search.agent.ts` |
| 注册工具 | `backend/movie-service/src/movie/agents/tools/tools.registry.ts` |
| 提示词 | `backend/movie-service/src/movie/services/prompt-template.service.ts` |
| 模型 | `backend/movie-service/src/movie/types.ts`、`model/model.provider.ts` |
| 会话与向量 | `backend/message-service/src/message/message.service.ts` |
| 登录鉴权 | `backend/auth-service/src/auth/auth.service.ts` |
| 前端聊天 | `client/src/pages/HomePage/index.tsx`、`client/src/api.ts` |
| 反代 | `client/nginx.conf`、`docker-compose.yml` |

## 已知坑

- 鉴权白名单邮箱写死在 `AuthService.validateToken`。
- 图片与偏好提取 prompt 已写，主链路未真正消费 `imageData` / `preferences`。
- Relation 能力未完成；`RelationAnalysisService` 与 Agent 内逻辑重复且均是半成品。
- Compose 的 movie-service `env_file` 是 `backend/movie-service/.env`，auth/message 用 `backend/.env`。
- 前端 Dockerfile 激活的是 pnpm 9，`package.json` 声明 10.15.0。
- auth-service 用原始 `pg` Pool，message-service 用 TypeORM，不要混用两套用户表假设。
