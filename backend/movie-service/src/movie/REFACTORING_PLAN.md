# movie.service.ts 优化计划

## 需要删除的部分（旧逻辑）

### 1. 移除 `WorkflowPlanner` 相关代码
- ❌ `private readonly workflowPlanner: WorkflowPlanner` （第85行）
- ❌ `runLangGraphWorkflow()` 方法 （第527-573行）
- ❌ `planWorkflowStages()` 方法 （第575-583行）
- ❌ `runAgentNode()` 方法 （第585-603行）
- ❌ `runTmdbSearch()` 方法 （第605-640行）
- ❌ 所有涉及 `WorkflowState`, `WorkflowContext` 的相关逻辑

### 2. 移除所有 prompt 构建方法
- ❌ `buildSystemPrompt()` （第431-440行）
- ❌ `buildParsePrompt()` （第751-919行） - 超大方法
- ❌ `buildSupervisorPrompt()` （第921-957行）
- ❌ `buildStageInstruction()` （第959-973行）
- ❌ `buildPromptState()` 方法 （已被整合）

### 3. 移除已经在 helpers.ts 中重复的方法
- ❌ `truncateText()`
- ❌ `normalizeText()`
- ❌ `summarizeText()`
- ❌ `sanitizeImageData()`
- ❌ `extractNumber()`
- ❌ `extractRuntimeMinutes()`
- ❌ `tryParseJsonObject()`
- ❌ `extractJsonCandidate()`
- ❌ `sanitizeJsonLikeText()`
- ❌ `peekNonWhitespaceChar()`
- ❌ `getStringValue()`
- ❌ `executeWithRetry()` 变为直接使用 helpers

### 4. 移除已经在 MovieSearchService 中的方法
- ❌ `buildTmdbQuery()`
- ❌ `buildTmdbQueryParamsFromPreferences()`
- ❌ `mapGenreToTmdbGenreId()`
- ❌ `mapLanguageToTmdb()`
- ❌ `validateTmdbQueryParams()`
- ❌ `buildStructuredSearchSummary()`
- ❌ `parseSearchResultMetadata()`
- ❌ `matchTmdbMovie()`
- ❌ `enrichRecommendationWithTmdbMetadata()`

## 需要修改的部分

### 1. 导入更新
```typescript
// 删除旧导入
- import { WorkflowPlanner, StageName }
- import { TmdbProvider, ... }

// 添加新导入
+ import { PromptTemplateService, MovieSearchService, RelationAnalysisService } from './services'
+ import { truncateText, normalizeText, sanitizeImageData, tryParseJson, ... } from './helpers'
+ import { WORKFLOW_CONSTANTS, MESSAGE_CONSTANTS, MESSAGE_STAGES, ... } from './constants'
```

### 2. 构造函数修改
```typescript
// 从
constructor(
  private readonly modelProvider: ModelProvider,
  private readonly tmdbProvider: TmdbProvider,
  private readonly authGrpcClient: AuthGrpcClient,
  private readonly messageGrpcClient: MessageGrpcClient,
  private readonly orchestratorAgent: OrchestratorAgent,
)

// 改为
constructor(
  private readonly modelProvider: ModelProvider,
  private readonly authGrpcClient: AuthGrpcClient,
  private readonly messageGrpcClient: MessageGrpcClient,
  private readonly orchestratorAgent: OrchestratorAgent,
  private readonly promptTemplateService: PromptTemplateService,
  private readonly movieSearchService: MovieSearchService,
  private readonly relationAnalysisService: RelationAnalysisService,
)
```

### 3. 简化 recommend() 方法
主要流程变为：
1. 验证授权
2. 确保对话存在
3. 加载对话历史
4. 调用 OrchestratorAgent 进行意图识别
5. 若意图在范围内，继续处理；否则返回拒绝
6. 使用 MovieSearchService + PromptTemplateService 进行搜索和推荐

### 4. 简化 classifyIntent() 方法
- 改为调用 PromptTemplateService.getIntentClassificationPrompt()
- 使用 PromptTemplateService 的 prompt 模板

### 5. 移除多个私有工具方法
- 统一使用 helpers.ts 中的方法替代
- 使用 constants.ts 中的常量

## 命名规范调整

### 私有方法添加下划线前缀
```typescript
// 从
private buildConversationHistory()
private normalizePreferences()

// 改为
private _buildConversationHistory()
private _normalizePreferences()
```

### 变量名规范化
- `conversationHistoryItems` → `conversationHistory` ✓ (已改)
- `orchestratorResult` ✓ (已改)

## 保留的方法

需要保留的重要业务方法：
- ✅ `recommend()` - 主方法（需简化）
- ✅ `classifyIntent()` - 保留但简化
- ✅ `validateAuthorization()` - gRPC相关
- ✅ `ensureConversation()` - 对话管理
- ✅ `loadConversationHistory()` - 历史加载
- ✅ `appendConversationMessage()` - 消息存储
- ✅ `getLatestUserMessageId()` - 消息查询
- ✅ `parseRecommendation()` - 推荐解析
- ✅ `normalizePreferences()` - 偏好规范化
- ✅ `mergePreferences()` - 偏好合并
- ✅ `stringifyPreferences()` - 偏好序列化
- ✅ `normalizePreferenceValue()` - 偏好值规范化
- ✅ `buildConversationHistory()` - 历史拼接
- ✅ `buildErrorResponse()` - 错误响应

## 预期效果

### 文件大小
- 当前：~1700 行
- 目标：~800-1000 行（减少 40-50%）

### 代码清晰度
- 职责分离更明确
- 业务逻辑更集中
- 更易于测试和维护

---

## 问题确认

❓ **是否同意按上述计划进行优化？**

如果有不同意的地方或需要调整，请告诉我！
