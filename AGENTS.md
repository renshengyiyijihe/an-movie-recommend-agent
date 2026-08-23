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
2. `MovieController`（`JwtAuthGuard` + `@CurrentUser()`）→ `MovieService.recommend()`：
   - HTTP 强制登录：无 token / 验票失败一律 `401`，不进入 Agent。请求体经 `RecommendDto` + 全局 `ValidationPipe` 校验。
   - 当前用户放进 `UserContext`；movie → message 的 gRPC 在 metadata `user-id` 里带身份，**请求体不传 `user_id`**。
   - `ensureConversation` / `loadConversationHistory`（gRPC `GetConversation`）/ `StartTurn` 写入本轮用户问题。message-service 从上下文取当前用户，只允许会话主人读写；无主会话、非本人一律按「不存在」处理。
   - 调用 `OrchestratorAgent.orchestrate(model, ctx)`；`ctx.shared.turns` 为结构化历史，prompt 按阶段投影，不要提前拼成一段字符串。完整检索数据进 `ctx.workspace`（本轮内存工作副本），`publish` 只给精简视图。工作流过程通过 `ctx.record()` 写入 `turn_events`。
   - 结束时 `CompleteTurn` 写入一条 assistant JSONB（`recommendation` / `reject` / `error`）。
3. Orchestrator：意图分类 → 任务规划（`TaskPlan`：`agents` + 可选 `relation`）→ 按 plan 执行 Agent → Relation 失败则补一次 Search → `synthesizeResults` 再调 LLM，把**视图**整理成推荐 JSON。意图为 `out_of_scope` 或 `unknown` 时立即短路，不进入后续阶段。
4. 域外（`out_of_scope`）返回 `{ type: "reject", data: RejectPayload }`；成功则 `parseRecommendation()` 解析 JSON 后 `{ type: "success", data: RecommendationPayload, conversationId }`。HTTP `data` 与写入 `CompleteTurn` 的 payload 同一份。

检索参数由 SearchAgent 按 tool schema 填写。`MovieService.parseRecommendation()` 只解析，不负责生成。关系计划在规划那一次给全，RelationAgent 不再另调 LLM，也不再调用 `SearchAgent.run`。

## 后端服务

### auth-service

- HTTP：`POST /auth/register`、`POST /auth/login`，DTO 校验（username 2–50，password 6–128）。
- 启动时 `CREATE TABLE IF NOT EXISTS users`。
- gRPC `Auth.ValidateToken`（`backend/proto/auth.proto`）。
- JWT：`JWT_SECRET`、`JWT_EXPIRES_IN`（默认 7d）。
- **硬编码白名单：** `validateToken()` 只放行 `1191681452@qq.com`。改鉴权策略时不要忽略这一点。
- 代码里 Postgres 默认 URL 是 `localhost:5432/anmovie_db`（与 Compose 库名一致）；Docker 下由 Compose 显式注入 `POSTGRES_URL`。

### movie-service

职责分层（保持这个边界）：

| 层 | 路径 | 做什么 |
| --- | --- | --- |
| HTTP 入口 | `movie/movie.controller.ts` | 仅 `/movie/recommend`，`JwtAuthGuard` + `@CurrentUser()`，DTO 在 `movie/dto/recommend.dto.ts` |
| 鉴权上下文 | `auth/` | `JwtAuthGuard`、`UserContext`、gRPC metadata `user-id` |
| 编排门面 | `movie/movie.service.ts` | 会话、调 Orchestrator、解析响应 |
| Agent | `movie/agents/` | 意图、规划、搜索、关系 |
| 工作副本 | `movie/working-set.ts` | 本轮内存数据；Tool 完整结果只进这里 |
| 规划校验 | `movie/task-plan.ts` | Zod 收口 `TaskPlan`；relation 不可用则改 search |
| Tools | `movie/agents/tools/` | 封装 TMDB |
| Prompt | `movie/services/prompt-template.service.ts` | 所有 LLM 提示词 |
| 模型 | `model/model.provider.ts` | LangChain `ChatOpenAI` 兼容 SiliconFlow |
| TMDB | `model/tmdb.provider.ts` | 只提供 base url 和鉴权头，各 Tool 自行拼 URL |
| 辅助 | `movie/helpers.ts`、`movie/constants.ts`、`movie/types.ts` | 重试、JSON 解析、类型/常量 |

LLM：优先 `SILICONFLOW_API_KEY`，否则 `OPENAI_API_KEY`。默认 `SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`，默认模型 `deepseek-ai/DeepSeek-V4-Flash`。客户端设 `timeout=60s`、SDK 层 `maxRetries=2`（覆盖网络/429/5xx）；业务层 `executeWithRetry` 只管输出格式错误。

`LangSmithProvider` 存在，但当前 `ModelProvider` 未接入追踪。部署脚本仍写 `NVIDIA_API_KEY`，与代码读取的 SiliconFlow/OpenAI 变量不一致。

关系逻辑只写在 `RelationAgent` 内部。不要再平行实现一套搜索或关系服务，也不要把交并差放到 message-service。

### message-service

- REST（`JwtAuthGuard`）：`POST /message/conversations`、`GET /message/conversations`、`GET /message/conversations/:id`。
- gRPC：`CreateConversation`、`StartTurn`、`AppendTurnEvent`、`CompleteTurn`、`GetConversation`、`GetTurn`、`SearchSimilarContext`。调用身份走 metadata `user-id`（`GrpcUserGuard`），proto 请求体不带 `user_id`。只允许会话主人，无主会话和越权一律按「不存在」处理。内部清扫僵死轮次走 `finishTurn`，不经过用户上下文。
- TypeORM `synchronize: true`，表 `conversations` / `turns` / `messages` / `turn_events`。
- `turns` 只管一轮的 `running | success | reject | error`，不存问答正文。
- `messages.content` 是可见气泡的 JSONB（`user_query` / `recommendation` / `reject` / `error`）。`GetConversation` 返回已完成轮次的全部气泡 + running 轮次的用户消息（刷新后能看到未回答的提问），扁平 `ChatItem` 给前端直接展示。
- 停留在 `running` 超过 10 分钟的轮次由 `MessageService.sweepStaleTurns`（启动即清一次，之后每分钟）复用 `finishTurn` 收尾成 `error`，并写入一条 assistant error 气泡。
- `turn_events.body` 是 Agent 内部时间线 JSONB；message-service 不解析 `kind`。`seq` 由服务端按轮次递增。
- 推荐成功且 payload 含 `summary` 时异步写入 Milvus collection `message_summary_embeddings`（维度 1024，embedding 默认 `BAAI/bge-m3`）。Milvus 失败不阻断主流程。
- 启动会轮询等待 Milvus healthy。

## Agent 系统

```text
OrchestratorAgent
  ├─ classifyIntent     → in_scope | out_of_scope | unknown
  ├─ planTask           → TaskPlan { agents, relation? }
  │                       parseTaskPlan 收成单一 Agent；relation 不可用则 search
  ├─ executeAgentPlan   → 按注册表顺序执行
  ├─ fallbackSearch     → Relation publish 失败且本轮未跑 Search 时补一次
  └─ synthesizeResults  → LLM 把 Agent 视图整理成 { text, movies } JSON
        ├─ SearchAgent   → LLM 规划 tool_calls（1–4 个）→ ToolsRegistry
        │                  结果 ingest 进 workspace，publish 视图
        └─ RelationAgent → 按 shared.relationPlan 调 Tool + 本地集合运算
                           不另调 LLM，不调用 SearchAgent.run
```

模型次数：意图 1 + 规划 1 +（仅 Search 路径）选工具 1 + 汇总 1。Relation 成功路径没有选工具那一次。

### 工作副本与视图

- `WorkingSet` 挂在 `WorkflowContext` 上，**只活在这一次 HTTP**，不写 Postgres。
- Tool 的结构化结果 `ingestToolData` 进副本（人物作品表、影片演职员等）。`raw_result` 不准进副本，也不准进 prompt。
- `publish` / 汇总只收 `AgentEvidenceView`：`answer` 为 `movies` | `people` | `fact`，影片卡片对齐前端字段，人物带标量（含由生日算出的 `age`）。
- 列表进模型的条数看 `VIEW_CONSTANTS`（默认 8），不是 `TMDB_CONSTANTS.DEFAULT_MAX_RESULTS`（列表工具未指定 `max_results` 时默认 3）。
- 规划可带 `relation.view`（`includeCredits` / `includeBiography`）。未写则不要把传记和整表作品塞进视图。
- `turn_events` 的 `tool_call.output` 只记摘要（成功、error、id/条数），`actor` 为 `search` 或 `relation`。

不要把工作副本改成每步都写 Postgres「用完再删」；跨轮复用中间结果若以后要做，单独加带 TTL 的缓存，和本轮内存副本分开。

### Relation

规划一次给出 `RelationPlan`（类型在 `types.ts`）：

- `strategy`：`discover` | `compute` | `unsupported`
- `discover`：人 + 类型/年份/评分，或「谁和谁合作过」→ 解析 person_id 后一次 `movie_discover`（`with_cast` / `with_crew` / `with_people`）
- `compute`：人∩人作品表交/并/差、片∩片共同演职员、「X 是否出演 Y」
- `unsupported`：计数、排名、再跳一层、公司/系列 → 走 search
- 实体最多 3 个（`RELATION_CONSTANTS.MAX_ENTITIES`）；对不上号或工具失败则 publish 失败，编排层回退 Search
- 空交集是成功：视图 `movies: []`，由汇总如实说明，不要再 publish 占位成功句

不要把 Relation 理解成「两个例子」或 `RelationshipType` 枚举（该类型已删除）。也不要再加一轮「关系分析」LLM。

已注册 Tools（`ToolsRegistry`）：

- `movie_search` — TMDB `/search/movie`
- `movie_discover` — TMDB `/discover/movie`（`with_cast` / `with_crew` / `with_people` / `vote_average_gte` / `max_results`）
- `movie_detail` — TMDB `/movie/{id}`（请求了 `credits` 时简化结果保留演职员）
- `person_search` — TMDB `/search/person`
- `person_detail` — TMDB `/person/{id}`（`movie_credits` 同时保留 cast 与 crew）

所有 Tool 实现 `ITool`（`name` / `description` / `schema` / `execute`），结果统一 `ToolResult`。公共参数 schema 在 `tools/common.ts`。默认语言 `zh-CN`。`poster_path` 是相对路径，域名前缀由前端 `getTmdbImage` 拼接，后端不要拼完整图片 URL。

Prompt 入口（改提示词只动这个文件）：

- `getResultSynthesisPrompt`（视图 → 最终推荐 JSON）
- `getIntentClassificationPrompt`
- `getTaskPlanningPrompt`（顺带产出 `relation`，没有单独的关系分析 prompt）
- `getSearchToolPlanningPrompt`（会注入实时 tool schema）

对话历史以 `ConversationHistoryItem[]` 传入，由 `projectConversationHistory` 按阶段裁剪/压缩后再写入 prompt。可见消息类型在 `transcript.ts`，工作流事件类型在 `turn-events.ts`。

`SearchAgent` 用 Zod 校验工具计划，再按各 tool 的 JSON Schema 校验参数；失败走 `executeWithRetry`（`MAX_RETRIES=3`）。`planTask` 用 `parseTaskPlan`，relation 字段不合法时收成 search，不要让整轮规划重试三次后炸掉。

## 前端

- 单页：`client/src/pages/HomePage`。路由只有 `/`。
- 状态：Zustand `store/auth.ts`，token 存 `localStorage`。
- HTTP：`api.ts` 的 `request()` 自动带 Bearer；`baseURL: '/'`。Docker 下由 nginx 反代；本地 `vite` 默认 **没有** 把 `/api` 转到后端。
- 组件：`TopBar`、`AuthModal`、`ConfigModal`（会话列表）、`RecommendationPoster`。样式用 Less CSS Modules。
- 同时依赖 Mantine 7 与 MUI 9，新增 UI 优先复用现有组件，不要再引入第三套库。
- 发送推荐前必须登录。后端 `/movie/recommend` 无 token 或验票失败返回 `401`，前端会弹出登录框。图片以 Data URL 传 `imageData`，**后端 Orchestrator 当前未使用图片**；上传预览只留在输入区，不进聊天消息。
- 聊天列表与后端 `ChatItem` 对齐：`role` 只有 `user` | `assistant`，`kind` 为 `user_query` | `recommendation` | `reject` | `error`，一条助手消息一个气泡（`text` 下方可选 `movies` 卡片）。
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
- 第三方库：功能开发时可以引入，**加依赖前必须先问**（包名、加到哪个服务或前端、解决什么问题）。未同意不得自行 `pnpm add`。已有库能覆盖的不要再装功能重叠的包。前端 UI 仍只复用 Mantine / MUI，不要第三套组件库。
- 通用集合/对象操作（截取、去重、钳制、判断普通对象等）不要在仓库里再写一套；movie-service 用 **lodash-es**（按函数 import）。解析 LLM JSON、周岁、带退避重试这类有业务语义的，留在 `helpers.ts`。`asRecord` / `asArray` / `takeFirst` / `clampMaxResults` / `uniqueIds` / `uniqueByLast` 仍从 `helpers.ts` 出口，内部走 lodash-es，各文件不要再复制一份 `uniqueIds` 或手写 `Map` 去重。
- HTTP 鉴权用 `JwtAuthGuard`，当前用户用 `@CurrentUser()` / `UserContext`，不要在每个方法里读 `Authorization` 或传 `userId`。
- movie → message 的身份走 gRPC metadata `user-id`，由客户端从 `UserContext` 注入。proto 请求不要带 `user_id`。会话表 / `GetConversation` 响应里的 `user_id` 是会话主人字段，不是调用身份。
- 新增 **Agent**：扩展 `AGENT_TYPE` / `AGENT_TYPES`，在 `OrchestratorAgent` 的 `agentExecutors` 用 `AGENT_TYPE.*` 注册，不要改执行循环本身。
- 新增 **工作流事件**：扩展 `TurnEventBody`，在 Agent 里 `runtime.record()` / `ctx.record()`。message-service 只存 JSONB，不要在那边 switch kind。
- 可见聊天消息只走 `StartTurn` / `CompleteTurn`，payload 类型在 `transcript.ts`。
- 新增 **Tool**：实现 `ITool`，在 `ToolsRegistry.registerTools()` 注册。SearchAgent 会自动拿到 schema，不要在 Agent 里再写一份参数定义。
- 新增 / 修改 **Prompt**：只改 `PromptTemplateService`。对话历史在 prompt 内按阶段投影，不要在 service 里先拼成字符串。关系计划只改 `getTaskPlanningPrompt`，不要再加一层分析 prompt。
- 通用文本、JSON、重试、对象收窄：用 `helpers.ts`，不要在 service / agent 里再实现一遍 `asRecord` / `tryParseJson` / `uniqueIds` / `uniqueByLast`。
- 会话历史投影：用 `conversation-history.ts`。
- 工作副本读写：用 `WorkingSet` / `buildEvidenceView`，不要把 Tool `data` 整包 `JSON.stringify` 进汇总 prompt。人物/影片加**标量**字段：改 `PersonRecord` / `MovieRecord`，并只在 `readPersonRecord` / `readMovieRecord` 取值；不要再给 `upsert*` 手写一遍赋值。只有需要去重合并的数组才进 `PERSON_COLLECTIONS` / `MOVIE_COLLECTIONS`。
- 类型：Agent / 规划 / 视图合同在 `types.ts`；工作副本记录类型在 `working-set.ts`。genre 映射在 `constants.ts`。不要在 agent 文件里再声明一份公用联合类型。公共类型用 **TSDoc**（即 JSDoc 的 `/** */`）：常量对象、联合类型、接口以及**每个字段**都要写清含义；函数写 `@param` / `@returns`。**工具函数**（把一种数据收成另一种）必须写 `@example`：**一条业务数据就够**，但要看得出从哪来、中间丢掉了什么、输出字段写全（不要 `{ id: 1 }` 或 `...`）。编排、Agent、HTTP 入口不必硬凑示例。
- **禁止硬编码封闭取值。** `AGENT_TYPE`、`INTENT_TYPE`、`RELATION_STRATEGY`、`RELATION_ROLE`、`TOOL_NAME`、`VIEW_ANSWER`、`HISTORY_PROJECTION_KIND` 等已在 `types.ts` 定义的常量，业务代码、Zod、prompt 插值一律引用常量，不要写 `"search"` / `"relation"` 这种字面量。新增封闭集合时先在 `types.ts` 加常量对象，再导出 `as const` 数组给 Zod `z.enum`。TMDB 响应字段名（如 JSON 里的 `cast` 属性）和 HTTP 对外 JSON 字段（如汇总里的 `movies` 数组）属于外部契约，不在此列。
- LLM 结构化输出必须可被 `tryParseJson` 解析；成功回复的可见字段是 `text` + `movies`，拒绝/失败是 `message`。视图的 `answer` 为 `people` / `fact` 时，不要把人物 id 写进 `movies`。
- 跨服务契约先改 `backend/proto/*.proto`，再改 client/server 实现。
- 日志用 `Logger`，关键路径已有 `query` / `intent` / `tool` 日志，保持同风格。
- 不要提交 `.env`、密钥、`node_modules`、`dist`。
- 用户要求用简体中文回复；代码标识符保持英文。

## 改动时优先读的文件

| 目的 | 文件 |
| --- | --- |
| 推荐入口与会话 | `backend/movie-service/src/movie/movie.service.ts` |
| HTTP / gRPC 鉴权 | `backend/movie-service/src/auth/`、`backend/message-service/src/auth/` |
| 工作流上下文 | `backend/movie-service/src/movie/agents/workflow-context.ts` |
| 工作副本 / 视图 | `backend/movie-service/src/movie/working-set.ts` |
| 任务规划校验 | `backend/movie-service/src/movie/task-plan.ts` |
| 历史投影 | `backend/movie-service/src/movie/conversation-history.ts` |
| 可见消息 / 事件类型 | `backend/movie-service/src/movie/transcript.ts`、`turn-events.ts` |
| 会话 gRPC | `backend/movie-service/src/movie/message.grpc.ts`、`backend/proto/message.proto` |
| 意图与调度 | `backend/movie-service/src/movie/agents/orchestrator.agent.ts` |
| 工具规划与执行 | `backend/movie-service/src/movie/agents/search.agent.ts` |
| 关系执行 | `backend/movie-service/src/movie/agents/relation.agent.ts` |
| 注册工具 | `backend/movie-service/src/movie/agents/tools/tools.registry.ts` |
| 提示词 | `backend/movie-service/src/movie/services/prompt-template.service.ts` |
| 模型与规划类型 | `backend/movie-service/src/movie/types.ts`、`model/model.provider.ts` |
| 会话与向量 | `backend/message-service/src/message/message.service.ts` |
| 登录鉴权 | `backend/auth-service/src/auth/auth.service.ts` |
| 前端聊天 | `client/src/pages/HomePage/index.tsx`、`client/src/api.ts` |
| 反代 | `client/nginx.conf`、`docker-compose.yml` |

## 已知坑

- 鉴权白名单邮箱写死在 `AuthService.validateToken`。
- 内部 gRPC 信任 metadata 里的 `user-id`（依赖 Docker 网络隔离，message-service 不再二次验 JWT）。
- 图片主链路仍未消费 `imageData`。
- Relation 未做：计数/排名、多跳路径、公司/系列。规划应标 `unsupported` 或直接 `search`，不要假装能算。
- 工作副本不跨请求保留；指代「刚才那批结果再筛」目前只能靠历史文本 + 重新取数。
- Compose 的 movie-service `env_file` 是 `backend/movie-service/.env`，auth/message 用 `backend/.env`。
- 前端 Dockerfile 激活的是 pnpm 9，`package.json` 声明 10.15.0。
- auth-service 用原始 `pg` Pool，message-service 用 TypeORM，不要混用两套用户表假设。
