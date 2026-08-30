# An-movie Agent 指南

面向后续对话的项目地图与编码约定。改代码前先对齐这里的职责边界，不要把逻辑塞回已经拆出去的模块。

## 项目是什么

面向电影领域的自然语言 Agent。用户可以用自然语言提问、检索、查人物关系、要推荐（前端还可上传图片）；后端用 LLM 做意图识别与任务规划，再通过 TMDB 工具检索，返回结构化结果。

技术栈：React 18 + Vite 前端；三个独立 NestJS 10 服务；PostgreSQL；Milvus 向量检索；LangChain / SiliconFlow；TMDB。包管理器统一为 **pnpm 10.15.0**。

## 仓库结构

```text
an-movie-agent/
├── package.json                 # 仅工具链：lint / typecheck / husky / commitlint
├── packages/
│   ├── Dockerfile               # 共享包镜像（compose 制品）；应用 Dockerfile 从源码自编，不要 FROM 它
│   ├── contracts/               # 错误码、校验常量、聊天气泡、chat SSE 契约（file: 依赖）
│   └── auth-client/             # JwtAuthGuard、Auth gRPC 客户端、异常过滤器、request-id
├── client/                      # 前端（Vite + React）
├── backend/
│   ├── proto/                   # 跨服务共享 .proto（构建时 COPY 进各镜像）
│   ├── auth-service/            # 注册登录 + JWT + gRPC 验票
│   ├── movie-service/           # 推荐工作流 / Agent / TMDB
│   └── message-service/         # 会话消息 + Milvus 相似上下文
├── docker-compose.yml           # 镜像 context 为仓库根
├── scripts/deploy-images.sh     # 服务器上按 diff 编镜像再 up -d
├── observability/               # Prometheus 刮取 + Grafana 数据源 / 总览仪表盘
└── .github/workflows/
    ├── quality.yml              # lint + 部署规划自检 + 四包 build（可复用）
    ├── ci.yml                   # PR 跑 quality
    └── deploy.yml               # quality 通过后 SSH 部署
```

根级 `package.json` 只装 ESLint / Prettier / husky / commitlint，**没有 pnpm workspace**。四个应用仍各自 lockfile；共享包用 `file:` 引用 `@an-movie/contracts` / `@an-movie/auth-client`。根目录聚合命令：`pnpm typecheck`、`pnpm lint`、`pnpm build`（会先编共享包）。commit message 须符合 Conventional Commits，允许的 `type` 以 `commitlint.config.mjs` 为准。

HTTP 错误体为 `{ code, message, details?, requestId? }`，`code` 见 `packages/contracts` 的 `ERROR_CODE`。各服务 `GET /health` 只表示进程活着；`GET /ready` 才给 Compose 探活（auth：JWT + Postgres，message：Postgres + Milvus，movie：`LLM_API_KEY` 存在）。`GET /metrics` 为 Prometheus 文本。这三个口 nginx 都不反代。Prometheus 在 Compose 网内刮三个 `/metrics`，Grafana 查 Prometheus。日志为 JSON（pino），带 `service` / `requestId`。


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
Prometheus      ──HTTP──► auth:3002 / movie:3001 / message:3003  /metrics
Grafana         ──HTTP──► Prometheus:9090
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
| Grafana | http://localhost:3000（默认 admin / yangjinhu） |

## 对话主链路（改这里前先读）

1. 前端 `HomePage` 走 `streamChat()`（`client/src/api.ts`），`POST /api/movie/chat`，带 `message`、可选 `imageData`、`conversationId`，Header `Authorization: Bearer <jwt>`，`Accept: text/event-stream`。其它接口仍走 `request()`。
2. 鉴权 / DTO 失败（无 token、验票失败、校验失败）仍返回 JSON `{ code, message }`，**不开流**，不进入 Agent。`JwtAuthGuard` + `@CurrentUser()`；请求体经 `ChatDto` + 全局 `ValidationPipe`。
3. 通过后 `MovieController` 调用 `openChatSse`，固定 `200` + `text/event-stream`。之后只推 SSE，不再返回 JSON 成功体。事件名与 JSON 形状在 `packages/contracts/src/stream.ts`（`STREAM_EVENT` / `STREAM_STAGE`）。
4. `MovieService.chat(payload, emit)`：
   - 当前用户放进 `UserContext`；movie → message 的 gRPC 在 metadata `user-id` 里带身份，**请求体不传 `user_id`**。
   - `ensureConversation` / `loadConversationHistory`（gRPC `GetConversation`）/ `StartTurn` 写入本轮用户问题。同一会话同时只能有一个 `running` 轮次；冲突或 StartTurn 失败推 SSE `final`（`type: error`），不是 HTTP 4xx。message-service 从上下文取当前用户，只允许会话主人读写；无主会话、非本人一律按「不存在」处理。
   - StartTurn 成功后推 `turn`（`conversationId` + `turnId`）。
   - 调用 `OrchestratorAgent.orchestrate(model, ctx)`；`ctx.shared.turns` 为结构化历史，prompt 按阶段投影，不要提前拼成一段字符串。完整检索数据进 `ctx.workspace`（本轮内存工作副本），`publish` 只给精简视图。工作流过程通过 `ctx.record()` 写入 `turn_events`；`toStreamStageEvent`（`chat-stream.ts`）把 `intent` / `plan` / `tool_call` / `agent_result` 推成 `stage`。`llm_usage` / `error` 不推；汇总开始也不单独推。
   - 结束时 `CompleteTurn` 写入一条 assistant JSONB（`recommendation` / `reject` / `error`）。**先写入再推 `final`**；`final` 的 `type` / `data` 与写入的 payload 同一份。写入失败不得推 `success` / `reject`。
   - 开流后未能收成 `final` 的内部失败推 `error`（文案用 `MESSAGE_CONSTANTS.UNEXPECTED_FAILURE`，不要把异常原文推到浏览器）。
5. Orchestrator：意图分类 → 任务规划（`TaskPlan`：`agents` + 可选 `relation`）→ 按 plan 执行 Agent → Relation 失败则补一次 Search → `synthesizeResults` 再调 LLM，把**视图**整理成推荐 JSON。意图为 `out_of_scope` 或 `unknown` 时立即短路。域外 `final` 为 `{ type: "reject", data: RejectPayload }`；成功则 `parseRecommendation()` 后 `{ type: "success", data: RecommendationPayload }`。

检索参数由 SearchAgent 按 tool schema 填写。`MovieService.parseRecommendation()` 只解析，不负责生成。关系计划在规划那一次给全，RelationAgent 不再另调 LLM，也不再调用 `SearchAgent.run`。nginx 对 `location = /api/movie/chat` 单独 `proxy_buffering off`，超时 300s；其余 `/api/movie/*` 仍走默认 location。

### chat SSE（不要再当 JSON 接口改）

`POST /movie/chat` **没有 JSON 成功体**。鉴权 / DTO 失败才是 `{ code, message }`；一旦开流就是 `200` + `text/event-stream`，直到 `final` 或 `error` 后关流。契约：`packages/contracts/src/stream.ts`。编解码：后端 `movie/chat-stream.ts`，前端 `client/src/utils/chat-stream.ts`。

```text
POST /api/movie/chat   Accept: text/event-stream
  ├─ 401 / 400 → JSON { code, message }     不开流
  └─ 200 text/event-stream
       event: turn      StartTurn 成功（conversationId + turnId）
       event: stage     可多条：intent → plan → tool* → agent
       event: final     CompleteTurn 之后的业务结论
    或 event: error     开流后未能收成 final（泛化文案）
```

| `event` | 何时推 | 载荷要点 | 前端 |
| --- | --- | --- | --- |
| `turn` | `StartTurn` 成功 | `conversationId`、`turnId` | 记下会话 id，后续提问带上；历史列表没有该项则本地插入，不为此 refetch |
| `stage` | `ctx.record()` 且 `toStreamStageEvent` 能映射 | 见下表；不含 Tool 完整结果 | 只改加载文案，**不进**消息列表 |
| `final` | **先** `CompleteTurn` **再**推 | `type` + `data` 与写入 payload 同一份 | 收成一条助手气泡 |
| `error` | 开流后未收成 `final` | `message`（`UNEXPECTED_FAILURE`） | 错误气泡 |

`final.type` 为 `success` / `reject` / `error` / `cancelled`（`TURN_STATUS` 去掉 `running`，即 `FinishedTurnStatus`）。用户点「停止」走 `POST /api/movie/chat/cancel`（JSON，不是 SSE），`reason` 为 `user` 或 `timeout`。取消令牌用 movie-service 的 `AbortContext`（ALS），不要把 `signal` 从 Orchestrator 传到 Tool。断线 / 刷新**不**取消工作流；只有停止按钮和前端超时会 abort + CAS 收口。汇总已经算出可写结果时，仍按成功落库（与 cancel 并发由 `finishTurn` 行锁决定）。写入失败不得推 `success` / `reject` / `cancelled`。不要用 `EventSource`（它只支持 GET）；前端用 `fetch` + `streamChat()`。停止时不要 `abort()` 那条 SSE，等原来的 `final`。

`stage` 由 `turn_events.kind` 精简而来，不是 kind 全集：

| `stage` | 来自 | 不推 |
| --- | --- | --- |
| `intent` | `intent` | `llm_usage` |
| `plan` | `plan` | `error`（工作流内部） |
| `tool` | `tool_call`（每个 tool 返回后立刻 record） | 汇总开始（没有单独 stage） |
| `agent` | `agent_result` | |

`final.type` 与气泡 `kind`、SSE `event` 不是同一套字。

## 后端服务

### auth-service

- HTTP：`POST /auth/register`、`POST /auth/login`、`POST /auth/password`（已登录改密）、`POST /auth/username`（已登录改用户名）。DTO 校验（username 2–50，password 6–128）。
- 改密 / 改用户名：`LocalJwtGuard` 调本进程 `validateToken()`，不要用 `JwtAuthGuard`（会 gRPC 打回自己）。身份从 JWT 取。改密请求体只有 `currentPassword` / `newPassword`，确认密码仅前端；当前密码错用 `INVALID_CREDENTIALS`，新旧相同用 `VALIDATION_FAILED`。改用户名请求体只有 `username`，不要确认用户名；与当前相同用 `VALIDATION_FAILED`。成功后更新并签发新 JWT，不登出。
- 启动时 `CREATE TABLE IF NOT EXISTS users`。
- gRPC `Auth.ValidateToken`（`backend/proto/auth.proto`）。
- JWT：`JWT_SECRET`、`JWT_EXPIRES_IN`（默认 7d）。
- **硬编码白名单：** `validateToken()` 只放行 `1191681452@qq.com`。改鉴权策略时不要忽略这一点。
- 代码里 Postgres 默认 URL 是 `localhost:5432/anmovie_db`（与 Compose 库名一致）；Docker 下由 Compose 显式注入 `POSTGRES_URL`。

### movie-service

职责分层（保持这个边界）：

| 层 | 路径 | 做什么 |
| --- | --- | --- |
| HTTP 入口 | `movie/movie.controller.ts` | `/movie/chat` 开 SSE；`/movie/chat/cancel` 收口轮次。DTO：`chat.dto.ts` / `cancel-chat.dto.ts` |
| SSE 编解码 | `movie/chat-stream.ts` | 开流、写帧、`turn_events` → `stage` |
| 鉴权上下文 | `auth/` | `JwtAuthGuard`、`UserContext`、gRPC metadata `user-id` |
| 编排门面 | `movie/movie.service.ts` | 会话、调 Orchestrator、`emit` 流事件、`cancelTurn` |
| 取消令牌 | `movie/abort-context.ts`、`movie/turn-abort.registry.ts` | ALS `AbortSignal`；不要往 Agent/Tool 传 `signal` |
| Agent | `movie/agents/` | 意图、规划、搜索、关系 |
| 工作副本 | `movie/working-set.ts` | 本轮内存数据；Tool 完整结果只进这里 |
| 规划校验 | `movie/task-plan.ts` | Zod 收口 `TaskPlan`；relation 不可用则改 search |
| Tools | `movie/agents/tools/` | 封装 TMDB |
| Prompt | `movie/services/prompt-template.service.ts` | 所有 LLM 提示词 |
| 模型 | `model/model.provider.ts` | LangChain `ChatOpenAI` 兼容 SiliconFlow |
| TMDB | `model/tmdb.provider.ts` | `get` / `post`：鉴权、fetch、非 2xx 抛错。Tool 只拼 path + query，自己解析 JSON |
| 业务错误 | `movie/errors/` | 工作流错误类（如 `RetryableFormatError`），不要塞进 helpers |
| 辅助 | `movie/helpers.ts`、`movie/constants.ts`、`movie/types.ts` | 重试、JSON 解析、类型/常量 |

LLM：只读 `LLM_API_KEY`（缺了就起不来）和可选 `LLM_BASE_URL`（默认 `https://api.siliconflow.cn/v1`）。模型名/温度仍是 `MODEL_NAME`、`MODEL_TEMPERATURE`，默认 `deepseek-ai/DeepSeek-V4-Flash`。不要用供应商当密钥名。客户端 `timeout=60s`、SDK `maxRetries=1`（网络/429/5xx）；业务层 `executeWithRetry` **只重试** `RetryableFormatError`。检索全失败不要走成功推荐；空交集仍是成功。

关系逻辑只写在 `RelationAgent` 内部。不要再平行实现一套搜索或关系服务，也不要把交并差放到 message-service。

### message-service

- REST（`JwtAuthGuard`）：`POST /message/conversations`、`GET /message/conversations`、`GET /message/conversations/:id`、`PATCH /message/conversations/:id`（改标题，body `{ title }`，最长 `CONVERSATION_TITLE_MAX_LENGTH`）。
- gRPC：`CreateConversation`、`StartTurn`、`AppendTurnEvent`、`CompleteTurn`、`GetConversation`、`GetTurn`、`SearchSimilarContext`。调用身份走 metadata `user-id`（`GrpcUserGuard`），proto 请求体不带 `user_id`。只允许会话主人，无主会话和越权一律按「不存在」处理。内部清扫僵死轮次走 `finishTurn`，不经过用户上下文。
- TypeORM `synchronize: true`，表 `conversations` / `turns` / `messages` / `turn_events`。
- `turns` 只管一轮的 `running | success | reject | error | cancelled`，不存问答正文。
- `messages.content` 是可见气泡的 JSONB（`user_query` / `recommendation` / `reject` / `error` / `cancelled`）。`GetConversation` 返回已完成轮次的全部气泡 + running 轮次的用户消息（刷新后能看到未回答的提问），扁平 `ChatItem` 给前端直接展示。
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
        │                  每个 tool 返回后立刻 record；结果 ingest 进 workspace，publish 视图
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
- `turn_events` 的 `tool_call.output` 只记摘要（成功、error、id/条数），`actor` 为 `search` 或 `relation`。Search / Relation 都是每个 tool 返回后立刻 `record`，不要等全部跑完再批量写（SSE `stage: tool` 从这里推）。

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
- 布局：TopBar + 全宽主聊天。登录后顶栏为「历史」「配置」。点「历史」打开 `HistoryModal`：左会话列表、右消息详情（与主聊天同款气泡）。点列表某条才 `GET` 该条详情填右栏；空闲时同时把主聊天切过去，生成中只预览不改 `conversationId`。弹窗不关。窄屏同一弹窗：先列表，点选后全屏详情，有返回。不要常驻左侧会话栏、不要汉堡 Drawer。未登录不渲染历史/配置，不请求会话 API。「新对话」只在有消息时的会话顶栏右侧出现一次（发送中禁用该按钮），不要放进历史弹窗，也不要放进应用 TopBar。左侧标题可点按编辑；回车或点标题外先出 MUI `Popover` 二次确认，确认才 `PATCH`，取消或点空白处恢复原标题。不要靠输入框 `onBlur` 收口。超出单行省略，悬停用 MUI `Tooltip` 看全文，不要自封装 tooltip。成功后只改本地列表 / 当前详情，不要为此再拉列表。
- 会话目录不是配置弹窗。打开历史弹窗才 `GET /api/message/conversations` 拉列表；内存里已有则先展示再 silent 刷新。点选 `GET /api/message/conversations/:id`（`conversationDetailPath`）填右栏；同一条已打开过则用内存详情，不必再打。详情未成功前不要改当前 `conversationId`。路径写在 `API_PATH`，不要在页面里再写死 `/api/message/...`。发送和 SSE **不要**拉列表或详情。
- 「新对话」只清本地 `conversationId` / `messages`，**不要**预先 `POST /message/conversations`（会留下无标题空行）。首条发送仍由 movie-service `ensureConversation` 创建（title = 用户原话）。SSE `turn` 后若列表没有该项则本地插入，**不要**为此再拉列表。
- 发送中禁止新建对话；历史弹窗仍可打开、点选预览。断开 SSE **不会**取消后端轮次，工作流会继续并 `CompleteTurn`。点「停止」走 `POST /api/movie/chat/cancel`，不要 abort 那条 chat 流。
- `ConfigModal` 与 TopBar「配置」**保留**，只管家账号。弹窗两栏：左目录右详情，打开时选中第一项并展示其详情；目前目录只有「帐户」，窄屏也保持两栏。用户名在右侧资料行内编辑（右侧编辑按钮，回车 / 点空白 `Popover` 确认后再请求），不要第二层弹窗，也不要确认用户名。改密码仍是帐户详情里的按钮，点了再开独立表单弹窗。不要在配置里再放会话列表或消息预览。
- 状态：Zustand 为 `store/auth.ts`（token 在 `localStorage`）、toast、`store/preferences.ts`（用户本地偏好预留，当前无界面字段）。会话列表 / 当前对话放 `HomePage` 本地 state（`pages/HomePage/hooks/`），不要为历史数据再加全局 store。主聊天展示块放 `pages/HomePage/components/`（每个一块一个文件夹），不要抬到全局 `client/src/components/`。工作台重置只听 `userId`，不要听 `token`。
- HTTP：`api.ts` 的 `request()` 自动带 Bearer；`baseURL: '/'`。**只有 chat 走 `streamChat()` 读 SSE**，其它接口继续 `request()`。鉴权失效用 `isSessionExpiredError()`（登录 401「密码错误」、改密 401「当前密码错误」都不算过期）。Docker 下由 nginx 反代；本地 `vite` 默认 **没有** 把 `/api` 转到后端。
- 组件：`TopBar`、`HistoryModal`、`ChatTranscript`、`ConversationTitle`、`AuthModal`、`ConfigModal`、`ConfirmPopover`、`RecommendationPoster`。主聊天私有块在 `pages/HomePage/components/`（`ChatHero` / `ChatHeaderBar` / `ChatComposer` / `ChatLoadingBubble`）。会话标题/时间在 `utils/conversation.ts`。行内二次确认编辑用 `useConfirmableEdit` + `ConfirmPopover`（会话标题、配置用户名）。界面文案进 `TEXT`（`TEXT.workspace` 是历史弹窗、新对话与改标题，`TEXT.chat` 含主聊天 hero / 输入文案，`TEXT.config` 是配置弹窗）。样式用 Less CSS Modules。
- 登录/注册/改密表单用 `react-hook-form` + MUI `TextField`；密码框用 `AuthField`（`InputAdornment` + `@mui/icons-material` Visibility），不要再手写一套校验 state 或 SVG 眼睛图标。改用户名在配置帐户详情就地编辑，不要再做确认用户名表单。改密、改用户名成功后换新 token，不登出。
- UI 只用 MUI 9，不要再引入另一套组件库。
- 发送前必须登录。后端 `/movie/chat` 无 token 或验票失败返回 `401` JSON，前端会弹出登录框。图片以 Data URL 传 `imageData`，**后端 Orchestrator 当前未使用图片**；上传预览只留在输入区，不进聊天消息。
- 聊天列表与后端 `ChatItem` 对齐：`role` 只有 `user` | `assistant`，`kind` 为 `user_query` | `recommendation` | `reject` | `error`，一条助手消息一个气泡（`text` 下方可选 `movies` 卡片）。`final` 收成气泡；`stage` 只更新加载文案，不进消息列表。有消息时收起 hero，会话顶栏左侧显示当前会话标题（可点按编辑）、右侧「新对话」。
- nginx：`/api/movie/chat` 关缓冲；movie / message 代理超时 300s，与 `HTTP_CONSTANTS.REQUEST_TIMEOUT_MS`（5min，axios 与 chat 流式共用）对齐。

## 环境变量（不要提交 .env）

**auth-service / 共用 `backend/.env`**

- `JWT_SECRET`（必填，缺失则拒绝启动）、`JWT_EXPIRES_IN`
- `POSTGRES_URL`
- `AUTH_HTTP_PORT`（3002）、`AUTH_GRPC_BIND`（`0.0.0.0:50051`）

**movie-service（`backend/movie-service/.env`）**

- `PORT`（3001）
- `LLM_API_KEY`（必填）
- 可选 `LLM_BASE_URL`、`MODEL_NAME`、`MODEL_TEMPERATURE`
- `TMDB_API_KEY`、`TMDB_API_URL`
- `AUTH_GRPC_ADDRESS`、`MESSAGE_GRPC_ADDRESS`

**message-service**

- `PORT`（3003）、`MESSAGE_GRPC_PORT`（50052）
- `POSTGRES_URL`、`AUTH_GRPC_ADDRESS`、`MILVUS_URL`
- `SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_EMBEDDING_MODEL`

## 编码约定

- 语言：TypeScript。后端 NestJS injectable；前端函数组件。
- 第三方库：功能开发时可以引入，**加依赖前必须先问**（包名、加到哪个服务或前端、解决什么问题）。未同意不得自行 `pnpm add`。已有库能覆盖的不要再装功能重叠的包。前端 UI 只用 MUI，不要第三套组件库。
- 通用集合/对象操作（截取、去重、钳制、判断普通对象等）不要在仓库里再写一套；movie-service 用 **lodash-es**（按函数 import）。解析 LLM JSON、周岁、带退避重试这类有业务语义的，留在 `helpers.ts`。`asRecord` / `asArray` / `takeFirst` / `clampMaxResults` / `uniqueIds` / `uniqueByLast` 仍从 `helpers.ts` 出口，内部走 lodash-es，各文件不要再复制一份 `uniqueIds` 或手写 `Map` 去重。
- HTTP 鉴权用 `JwtAuthGuard`，当前用户用 `@CurrentUser()` / `UserContext`，不要在每个方法里读 `Authorization` 或传 `userId`。
- movie → message 的身份走 gRPC metadata `user-id`，由客户端从 `UserContext` 注入。proto 请求不要带 `user_id`。会话表 / `GetConversation` 响应里的 `user_id` 是会话主人字段，不是调用身份。
- 新增 **Agent**：扩展 `AGENT_TYPE` / `AGENT_TYPES`，在 `OrchestratorAgent` 的 `agentExecutors` 用 `AGENT_TYPE.*` 注册，不要改执行循环本身。
- 新增 **工作流事件**：扩展 `TurnEventBody`，在 Agent 里 `runtime.record()` / `ctx.record()`。message-service 只存 JSONB，不要在那边 switch kind。要推到浏览器再改 `toStreamStageEvent`（默认不推 `llm_usage` / `error`）。
- 新增 **SSE 事件 / stage**：先改 `packages/contracts/src/stream.ts` 的 `STREAM_EVENT` / `STREAM_STAGE`，再改 `chat-stream.ts` 编码和 `client/src/utils/chat-stream.ts` 解码。不要在 controller 里手写帧格式。
- 前端会话列表 UI 放 `HistoryModal`，拉取列表 / 打开弹窗 / 空闲时切主聊天放 `HomePage/hooks/useConversationWorkspace`。发流 / 停止放 `hooks/useChatTurn`。`index.tsx` 只接线，不要把 SSE 或列表面再写回去。「新对话」只放会话顶栏右侧，不要写进 `HistoryModal`、`ConfigModal` 或应用 TopBar，也不要为切换会话预先 POST 空会话。气泡渲染用 `ChatTranscript`。会话顶栏标题用 `ConversationTitle`：点按编辑，回车 / 点标题外用 MUI `Popover` 确认后再 `PATCH`；不要靠 input `onBlur` 收口。超出用 MUI `Tooltip`，不要自封装 tooltip。
- 可见聊天消息只走 `StartTurn` / `CompleteTurn`，payload 类型在 `transcript.ts`。SSE `final` 的 `data` 与写入 payload 同一份。
- 新增 **Tool**：实现 `ITool`，在 `ToolsRegistry.registerTools()` 注册。SearchAgent 会自动拿到 schema，不要在 Agent 里再写一份参数定义。调 TMDB 用 `TmdbProvider.get` / `post`，不要在 Tool 里 `fetch`。
- 新增 / 修改 **Prompt**：只改 `PromptTemplateService`。对话历史在 prompt 内按阶段投影，不要在 service 里先拼成字符串。关系计划只改 `getTaskPlanningPrompt`，不要再加一层分析 prompt。
- 通用文本、JSON、重试、对象收窄：用 `helpers.ts`，不要在 service / agent 里再实现一遍 `asRecord` / `tryParseJson` / `uniqueIds` / `uniqueByLast`。业务错误类放 `movie/errors/`，不要写进 `helpers.ts`。
- 会话历史投影：用 `conversation-history.ts`。`error` / `reject` 气泡不要进 prompt。用户正文用 `<user_query>` / `<conversation_history>` 包起来。
- 工作副本读写：用 `WorkingSet` / `buildEvidenceView`，不要把 Tool `data` 整包 `JSON.stringify` 进汇总 prompt。人物/影片加**标量**字段：改 `PersonRecord` / `MovieRecord`，并只在 `readPersonRecord` / `readMovieRecord` 取值；不要再给 `upsert*` 手写一遍赋值。只有需要去重合并的数组才进 `PERSON_COLLECTIONS` / `MOVIE_COLLECTIONS`。
- 类型：Agent / 规划 / 视图合同在 `types.ts`；工作副本记录类型在 `working-set.ts`。genre 映射在 `constants.ts`。不要在 agent 文件里再声明一份公用联合类型。公共类型用 **TSDoc**（即 JSDoc 的 `/** */`）：常量对象、联合类型、接口以及**每个字段**都要写清含义；函数写 `@param` / `@returns`。**工具函数**（把一种数据收成另一种）必须写 `@example`：**一条业务数据就够**，但要看得出从哪来、中间丢掉了什么、输出字段写全（不要 `{ id: 1 }` 或 `...`）。编排、Agent、HTTP 入口不必硬凑示例。
- **禁止硬编码封闭取值。** `AGENT_TYPE`、`INTENT_TYPE`、`RELATION_STRATEGY`、`RELATION_ROLE`、`TOOL_NAME`、`VIEW_ANSWER`、`HISTORY_PROJECTION_KIND`、`LLM_STAGE` 等已在 `types.ts` 定义的常量，以及 contracts 里的 `STREAM_EVENT` / `STREAM_STAGE` / `TURN_STATUS`，业务代码、Zod、prompt 插值一律引用常量，不要写 `"search"` / `"relation"` / `"final"` 这种字面量。新增封闭集合时先加常量对象，值列表用 `constValues` 从对象导出，不要再手抄一份。TMDB 响应字段名（如 JSON 里的 `cast` 属性）和 HTTP 对外 JSON 字段（如汇总里的 `movies` 数组）属于外部契约，不在此列。
- LLM 结构化输出必须可被 `tryParseJson` 解析；成功回复的可见字段是 `text` + `movies`，拒绝/失败是 `message`。视图的 `answer` 为 `people` / `fact` 时，不要把人物 id 写进 `movies`。
- 跨服务契约先改 `backend/proto/*.proto`，再改 client/server 实现。
- 日志用 `Logger`，关键路径已有 `query` / `intent` / `tool` 日志，保持同风格。
- 不要提交 `.env`、密钥、`node_modules`、`dist`。
- commit message 用 Conventional Commits：`type: subject`，不要写 `type(scope)`，模块写进 subject。允许的 `type` 写在 `commitlint.config.mjs` 的 `COMMIT_TYPES`（`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`）；husky `commit-msg` 会拦截不合规说明。改允许列表只改那份配置。
- 用户要求用简体中文回复；代码标识符保持英文。

## 改动时优先读的文件

| 目的 | 文件 |
| --- | --- |
| 对话入口与会话 | `backend/movie-service/src/movie/movie.service.ts` |
| chat SSE | `packages/contracts/src/stream.ts`、`backend/movie-service/src/movie/chat-stream.ts`、`client/src/utils/chat-stream.ts` |
| HTTP / gRPC 鉴权 | `packages/auth-client/`、`backend/message-service/src/auth/grpc-user.guard.ts` |
| 工作流上下文 | `backend/movie-service/src/movie/agents/workflow-context.ts` |
| 工作副本 / 视图 | `backend/movie-service/src/movie/working-set.ts` |
| 任务规划校验 | `backend/movie-service/src/movie/task-plan.ts` |
| 业务错误 | `backend/movie-service/src/movie/errors/` |
| 历史投影 | `backend/movie-service/src/movie/conversation-history.ts` |
| 可见消息 / 事件类型 | `packages/contracts/`（`chat.ts` / `stream.ts`）、`backend/movie-service/src/movie/transcript.ts`、`turn-events.ts` |
| 轮次状态 | `packages/contracts` 的 `TURN_STATUS`；已结束取值是 `FinishedTurnStatus` / `FINISHED_TURN_STATUSES`（去掉 `running`），不要在 entity 里再抄一份 |
| 会话 gRPC | `backend/movie-service/src/movie/message.grpc.ts`、`backend/proto/message.proto` |
| 意图与调度 | `backend/movie-service/src/movie/agents/orchestrator.agent.ts` |
| 工具规划与执行 | `backend/movie-service/src/movie/agents/search.agent.ts` |
| 关系执行 | `backend/movie-service/src/movie/agents/relation.agent.ts` |
| 注册工具 | `backend/movie-service/src/movie/agents/tools/tools.registry.ts` |
| 提示词 | `backend/movie-service/src/movie/services/prompt-template.service.ts` |
| 模型与规划类型 | `backend/movie-service/src/movie/types.ts`、`model/model.provider.ts` |
| 会话与向量 | `backend/message-service/src/message/message.service.ts` |
| 登录鉴权 | `backend/auth-service/src/auth/auth.service.ts` |
| 前端聊天 | `client/src/pages/HomePage/`（`index.tsx` 接线，`hooks/useConversationWorkspace` / `hooks/useChatTurn`）、`client/src/api.ts` |
| 前端停止生成 | `POST /api/movie/chat/cancel`；`AbortContext` / `TurnAbortRegistry` |
| 前端历史记录 | `client/src/components/HistoryModal/`、`client/src/components/ChatTranscript/`、`client/src/utils/conversation.ts` |
| 前端会话标题 | `client/src/components/ConversationTitle/`；`PATCH /message/conversations/:id` |
| 行内二次确认编辑 | `client/src/hooks/useConfirmableEdit.ts`、`client/src/components/ConfirmPopover/` |
| 前端登录/改密/改用户名 | `client/src/components/AuthModal/`、`client/src/components/ConfigModal/`、`client/src/store/auth.ts` |
| 反代 | `client/nginx.conf`、`docker-compose.yml` |
| 指标刮取 | `observability/prometheus.yml` |
| Grafana 数据源与总览盘 | `observability/grafana/` |
| 共享包镜像 | `packages/Dockerfile` |

## 已知坑

- 改密、改用户名会换发 JWT。前端工作台只在 `userId` 变化时重置；不要把 `token` 字符串放进这个 effect 的依赖，否则改资料会清掉当前会话并关掉配置弹窗。
- `JWT_SECRET` 必须显式配置，代码不再回退 `dev_secret`。
- 内部 gRPC 信任 metadata 里的 `user-id`（依赖 Docker 网络隔离，message-service 不再二次验 JWT）。
- 图片主链路仍未消费 `imageData`。
- chat 开流后客户端断开不会取消工作流；轮次会一直跑到 `CompleteTurn`。立刻重发仍可能撞「上一轮还在处理」。前端发送中禁用「新对话」；历史弹窗仍可预览其它会话，但不切换当前 `conversationId`。点「停止」或等待超时会 `POST /movie/chat/cancel` 解开 `running`。
- Relation 未做：计数/排名、多跳路径、公司/系列。规划应标 `unsupported` 或直接 `search`，不要假装能算。
- 工作副本不跨请求保留；指代「刚才那批结果再筛」目前只能靠历史文本 + 重新取数。
- 共享包源码在 `packages/`。各应用 Dockerfile 自己 `FROM node:24-alpine AS packages`，COPY 源码后编，再 `COPY --from=packages`。前端只编 contracts；三个后端编 contracts + auth-client。**不要** `FROM an-movie-packages`，也不要 `FROM sha256:…`：BuildKit 都会收成 `docker.io/library/…` 并对镜像源做 HEAD，部署机 `docker.m.daocloud.io` 对非官方 library 名一律 403。不要用 `additional_contexts`（旧 BuildKit 没有 named context）。`packages` compose 服务仍用 `packages/Dockerfile` 产一份制品，`pull_policy: never` 避免 `up -d` 再编或去 Hub 拉；应用镜像不再依赖它。该服务启动后立刻退出，`compose ps` 里 Exited 是正常的。
- 部署不再 `compose down` / `rm -f` 整栈；密钥仍写服务器 `.env`。镜像构建在 `scripts/deploy-images.sh`：对照 `.last-deploy-sha`（上次 **成功** `up -d` 的 commit，gitignore）用 `git diff` pathspec 决定编谁。只改 Grafana / Prometheus / 端口 / 环境变量不要重编应用镜像（compose 只看各构建服务的 `build:` / `image:`）。`packages/contracts`、`packages/Dockerfile`、`.dockerignore` 一变：packages + 四个应用（前端也 `COPY` contracts）。只改 `packages/auth-client`：packages + 三个后端，**不要**编 frontend。compose 里 `packages` 的 `build:` / `image:` 变了才带上四个应用。packages 源码刚变过时，后面的应用 build 必须 `--no-cache`（内联的 packages 阶段不要沿用旧层）。真正要编时仍然 **一次只编一个服务**，并且只给本次编过的镜像打 12 位 sha tag；`up -d` 成功后删掉不是本次 sha 的旧 tag。**不要**改成一次传入多个服务、不要打开 `COMPOSE_BAKE`。**不要**用镜像 tag 反推上次 sha。改规划后跑 `bash scripts/deploy-images.sh --self-test`。`compose-image-targets.py` 必须兼容部署机 **CPython 3.6**（没有 `capture_output` / `text=`）；quality 跑在更新的 Ubuntu Python 上，自检过不代表服务器能跑。`deploy.yml` 的 deploy job 用 `concurrency` 排队，**不要**改成 `cancel-in-progress: true`。排队的 run 若 `origin/main` 已不是该次 sha 则跳过构建（仍会 `git reset`，但不会写 `.last-deploy-sha`）。
- Compose 的 movie-service `env_file` 是 `backend/movie-service/.env`，auth/message 用 `backend/.env`。
- auth-service 用原始 `pg` Pool，message-service 用 TypeORM。`users` 表只归 auth-service，message 不要碰。
- Prometheus 不映射宿主机端口；看指标走 Grafana。总览盘会预置进去，网页里改完点保存会留下；只有仓库里那份仪表盘 JSON 以后又改了并重新部署，出厂布局才会再盖过来。删 `grafana_data` volume 会丢网页上改过的盘和密码。默认账号 `admin` / `yangjinhu`（`GF_SECURITY_ADMIN_*`）；已有 volume 不会因改环境变量自动改密，需 `grafana-cli admin reset-admin-password`。
