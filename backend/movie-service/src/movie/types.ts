/**
 * Agent 名。编排注册表、规划收口、prompt 插值都用这里。
 */
export const AGENT_TYPE = {
	/** SearchAgent：单人/单片查询、普通推荐、条件筛选 */
	SEARCH: "search",
	/** RelationAgent：跨实体合作、交并差、出演判定 */
	RELATION: "relation",
} as const;

/**
 * Agent 名元组，供 Zod `z.enum` 和 `includes` 校验。
 */
export const AGENT_TYPES = [AGENT_TYPE.SEARCH, AGENT_TYPE.RELATION] as const;

/**
 * 已注册 Agent 的字面量联合，等于 `AGENT_TYPE` 的取值。
 */
export type AgentType = (typeof AGENT_TYPES)[number];

/**
 * LangChain / 兼容模型 `invoke` 用的角色。
 */
export type ChatRole = "system" | "user" | "assistant";

/**
 * 发给模型的一条消息：`[角色, 正文]`。
 */
export type ChatMessage = [ChatRole, string];

/**
 * 一次 LLM 调用的阶段。日志、指标、turn_events.llm_usage 共用。
 */
export const LLM_STAGE = {
	/** 意图分类 */
	INTENT: "intent",
	/** 任务规划 */
	PLAN: "plan",
	/** SearchAgent 选工具 */
	SEARCH_TOOLS: "search_tools",
	/** 汇总推荐 JSON */
	SYNTHESIZE: "synthesize",
} as const;

/**
 * LLM 阶段元组。
 */
export const LLM_STAGES = [
	LLM_STAGE.INTENT,
	LLM_STAGE.PLAN,
	LLM_STAGE.SEARCH_TOOLS,
	LLM_STAGE.SYNTHESIZE,
] as const;

/**
 * LLM 调用阶段字面量。
 */
export type LlmStage = (typeof LLM_STAGES)[number];

/**
 * 一次模型调用的用量与耗时。
 */
export interface LlmUsage {
	/** 调用耗时，毫秒 */
	durationMs: number;
	/** 是否成功返回 */
	ok: boolean;
	/** 输入 token，供应商没给则缺省 */
	promptTokens?: number;
	/** 输出 token */
	completionTokens?: number;
	/** 合计 token */
	totalTokens?: number;
	/** 实际模型名 */
	model?: string;
}

/**
 * 工作流对聊天模型的最小依赖，便于测试时替换实现。
 */
export type CompatibleModel = {
	/**
	 * 调用一次模型。
	 * @param messages 系统/用户消息对
	 * @param options.stage 写入日志 / 指标 / turn_events 的阶段名
	 */
	invoke(
		messages: ChatMessage[],
		options: { stage: LlmStage },
	): Promise<{ content: unknown; usage: LlmUsage }>;
};

/**
 * 意图分类取值。
 */
export const INTENT_TYPE = {
	/** 电影/演员范围内，进入规划 */
	IN_SCOPE: "in_scope",
	/** 域外，直接拒绝，不跑 Agent */
	OUT_OF_SCOPE: "out_of_scope",
	/** 模型输出无效或调用失败，短路为错误 */
	UNKNOWN: "unknown",
} as const;

/**
 * 意图取值元组，供校验「是否为合法意图」。
 */
export const INTENT_TYPES = [
	INTENT_TYPE.IN_SCOPE,
	INTENT_TYPE.OUT_OF_SCOPE,
	INTENT_TYPE.UNKNOWN,
] as const;

/**
 * 意图分类结果的 `type` 字段。
 */
export type IntentType = (typeof INTENT_TYPES)[number];

/**
 * `classifyIntent` 的结构化输出。
 */
export interface IntentClassification {
	/** 是否在电影域内 */
	type: IntentType;
	/** 0–1，模型自评，仅作日志 */
	confidence: number;
	/** 域外或无法识别时的原因，可展示给用户 */
	reason?: string;
}

/**
 * 单个 Agent `publish` 之后，编排层看到的公开结果。
 */
export interface AgentExecutionResult {
	/** 是哪个 Agent 产出的 */
	agent: AgentType;
	/** 该 Agent 是否成功；失败时编排可能回退 Search */
	success: boolean;
	/** 通常是 `AgentEvidenceView` 的 JSON 字符串；失败时为错误说明 */
	result: string;
}

/**
 * Orchestrator 整轮工作流的返回值，交给 `MovieService` 解析。
 */
export interface OrchestratorResult {
	/** 是否产出了可解析的推荐 JSON；域外/未知意图为 false */
	success: boolean;
	/** 本轮意图，决定 HTTP 走 reject 还是推荐 */
	intent_type: IntentType;
	/** 成功时是推荐 JSON 字符串；失败时是说明文本 */
	result: string;
	/** 实际执行过的 Agent，含 Relation 失败后补上的 Search */
	agents_used: AgentType[];
	/** 各 Agent 的公开结果，供日志 */
	agent_results?: AgentExecutionResult[];
	/** 编排层捕获的异常信息 */
	error?: string;
}

/**
 * SearchAgent 内部一次 `run` 的工具执行记录。不直接进汇总 prompt。
 */
export interface SearchAgentResult {
	/** 至少一个 tool 成功。execute 还会再看工作副本有没有证据 */
	success: boolean;
	/** 兼容旧字段；execute 现在改为 publish 视图 */
	result: string;
	/** 规划并执行过的工具调用 */
	tool_calls: Array<{
		/** 工具名，应能在 `TOOL_NAME` 中找到 */
		tool_name: string;
		/** 传给 Tool.execute 的参数 */
		input: Record<string, any>;
		/** ToolResult，记事件前会瘦身 */
		output: any;
	}>;
	/** 模型选择这些工具的短说明 */
	reasoning?: string;
	/** 规划或执行失败时的原因 */
	error?: string;
}

/**
 * Relation 执行策略。
 *
 * - discover：条件能落成一次 movie_discover（含 with_cast / with_crew / with_people）。
 * - compute：必须在工作副本上做交、并、差或出演判定。
 * - unsupported：本轮不实现（计数、跳数、公司/系列等），编排层改走 search。
 */
export const RELATION_STRATEGY = {
	/** 解析人物 id 后一次 `movie_discover` */
	DISCOVER: "discover",
	/** 拉作品表/演职员后在内存做集合运算 */
	COMPUTE: "compute",
	/** 明确做不了，规划应收成 Search */
	UNSUPPORTED: "unsupported",
} as const;

/**
 * 关系策略元组，供规划 Zod schema。
 */
export const RELATION_STRATEGIES = [
	RELATION_STRATEGY.DISCOVER,
	RELATION_STRATEGY.COMPUTE,
	RELATION_STRATEGY.UNSUPPORTED,
] as const;

/**
 * {@link RELATION_STRATEGY} 的字面量联合。
 */
export type RelationStrategy = (typeof RELATION_STRATEGIES)[number];

/**
 * 关系计划里实体的种类。
 */
export const RELATION_ENTITY_TYPE = {
	/** 演员、导演等人物 */
	PERSON: "person",
	/** 具体影片 */
	MOVIE: "movie",
} as const;

/**
 * 实体种类元组，供规划 Zod schema。
 */
export const RELATION_ENTITY_TYPES = [
	RELATION_ENTITY_TYPE.PERSON,
	RELATION_ENTITY_TYPE.MOVIE,
] as const;

/**
 * {@link RELATION_ENTITY_TYPE} 的字面量联合。
 */
export type RelationEntityType = (typeof RELATION_ENTITY_TYPES)[number];

/**
 * 实体在关系中的职务提示。
 */
export const RELATION_ROLE = {
	/** 主演 / 出演 */
	CAST: "cast",
	/** 导演等职员 */
	CREW: "crew",
	/** 不限职务；discover 走 with_people */
	ANY: "any",
} as const;

/**
 * 职务元组，供规划 Zod schema。
 */
export const RELATION_ROLES = [
	RELATION_ROLE.CAST,
	RELATION_ROLE.CREW,
	RELATION_ROLE.ANY,
] as const;

/**
 * {@link RELATION_ROLE} 的字面量联合。
 */
export type RelationRole = (typeof RELATION_ROLES)[number];

/**
 * compute 策略在工作副本上做的集合运算。
 */
export const RELATION_OPERATION = {
	/** 交集，例如两人共同作品 */
	INTERSECT: "intersect",
	/** 并集 */
	UNION: "union",
	/** 差集：第一个实体的集合减去其余 */
	DIFFERENCE: "difference",
} as const;

/**
 * 集合运算元组，供规划 Zod schema。
 */
export const RELATION_OPERATIONS = [
	RELATION_OPERATION.INTERSECT,
	RELATION_OPERATION.UNION,
	RELATION_OPERATION.DIFFERENCE,
] as const;

/**
 * {@link RELATION_OPERATION} 的字面量联合。
 */
export type RelationOperation = (typeof RELATION_OPERATIONS)[number];

/**
 * 汇总阶段应采用的答案形态，避免把事实题硬做成片单。
 */
export const VIEW_ANSWER = {
	/** 给影片卡片 */
	MOVIES: "movies",
	/** 给人物列表（如共同主演） */
	PEOPLE: "people",
	/** 判断/年龄等事实，text 为主 */
	FACT: "fact",
} as const;

/**
 * 答案形态元组，供规划 Zod schema。
 */
export const VIEW_ANSWER_KINDS = [
	VIEW_ANSWER.MOVIES,
	VIEW_ANSWER.PEOPLE,
	VIEW_ANSWER.FACT,
] as const;

/**
 * {@link VIEW_ANSWER} 的字面量联合。
 */
export type ViewAnswerKind = (typeof VIEW_ANSWER_KINDS)[number];

/**
 * 已注册 TMDB 工具名。Relation 直接调用、工作副本 ingest 分支都用这里。
 */
export const TOOL_NAME = {
	/** 按片名搜索 */
	MOVIE_SEARCH: "movie_search",
	/** 按类型/人物/年份等筛选 */
	MOVIE_DISCOVER: "movie_discover",
	/** 影片详情，可 append credits */
	MOVIE_DETAIL: "movie_detail",
	/** 按人名搜索 */
	PERSON_SEARCH: "person_search",
	/** 人物详情，可 append movie_credits */
	PERSON_DETAIL: "person_detail",
} as const;

/**
 * 工具名元组，与 `ToolsRegistry` 已注册集合对齐。
 */
export const TOOL_NAMES = [
	TOOL_NAME.MOVIE_SEARCH,
	TOOL_NAME.MOVIE_DISCOVER,
	TOOL_NAME.MOVIE_DETAIL,
	TOOL_NAME.PERSON_SEARCH,
	TOOL_NAME.PERSON_DETAIL,
] as const;

/**
 * {@link TOOL_NAME} 的字面量联合，也是 `ITool.name` 的类型。
 */
export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * 规划里点名的实体。name 为用户说法或历史里的称呼。
 */
export interface RelationEntity {
	/** 如「小李子」「盗梦空间」 */
	name: string;
	/** 人还是片 */
	type: RelationEntityType;
	/** 省略则执行时按 {@link RELATION_ROLE.ANY} */
	role?: RelationRole;
}

/**
 * 能下推到 discover 或在 compute 之后过滤的条件。
 */
export interface RelationFilters {
	/** 中文类型名，如「科幻」，对应 movie_discover.with_genres */
	genres?: string[];
	/** 主要上映年份，对应 primary_release_year */
	year?: number;
	/** 最低平均评分 0–10 */
	voteAverageGte?: number;
	/** 按片名包含关系排除，不另打一轮模型去解析 id */
	excludeMovieNames?: string[];
}

/**
 * 规划指定的视图开关。只描述贵的部分；人物标量（姓名、年龄）默认带上。
 */
export interface RelationViewSpec {
	/** 是否把作品表带进给模型的视图，默认否 */
	includeCredits?: boolean;
	/** 作品表最多几条，规划校验上限 8 */
	creditLimit?: number;
	/** 是否带截断传记，默认否 */
	includeBiography?: boolean;
}

/**
 * 规划模型一次产出的关系计划。缺省或无法执行时编排层回退 search。
 */
export interface RelationPlan {
	/** 走 discover 还是本地集合运算 */
	strategy: RelationStrategy;
	/** 最多 3 个，见 `RELATION_CONSTANTS.MAX_ENTITIES` */
	entities: RelationEntity[];
	/** 年份、类型等可选过滤 */
	filters?: RelationFilters;
	/** 仅 compute 使用；缺省按 {@link RELATION_OPERATION.INTERSECT} */
	operation?: RelationOperation;
	/** 告诉汇总该写片单、人物还是事实 */
	answer: ViewAnswerKind;
	/** 贵字段开关；未写则不带传记和整表作品 */
	view?: RelationViewSpec;
}

/**
 * 意图之后的任务规划结果。agents 在编排层会被收成单一 Agent。
 */
export interface TaskPlan {
	/** 收口后实际是 search 或 relation 二选一 */
	agents: AgentType[];
	/** 仅当 agents 为 relation 且计划可执行时存在 */
	relation?: RelationPlan;
}

/**
 * 已解析到 TMDB id 的实体，写入 Relation 私有态。
 */
export interface ResolvedEntity {
	/** 规划里的原始称呼 */
	mention: string;
	/** 人还是片 */
	type: RelationEntityType;
	/** 解析时补上的职务，缺省已变成 any */
	role: RelationRole;
	/** TMDB person_id 或 movie_id */
	id: number;
}

/**
 * 从工作副本切给模型的视图说明。Search 用启发式生成，Relation 从计划投影。
 */
export interface ViewSpec {
	/** 答案形态 */
	answer: ViewAnswerKind;
	/** 是否带作品表 */
	includeCredits?: boolean;
	/** 作品表条数上限 */
	creditLimit?: number;
	/** 是否带传记 */
	includeBiography?: boolean;
	/** 影片卡片条数；缺省用 VIEW_CONSTANTS.MOVIE_LIMIT */
	movieLimit?: number;
}

/**
 * 视图中的人物。年龄由工作副本的 birthday 算出，不把整段作品表带上。
 */
export interface PersonViewItem {
	/** TMDB 人物 id */
	id: number;
	/** 显示名 */
	name: string;
	/** 由生日算出的周岁 */
	age?: number;
	/** 原始生日 YYYY-MM-DD，事实题备用 */
	birthday?: string;
	/** 如 Acting / Directing */
	known_for_department?: string;
	/** 仅 view.includeBiography 时出现，已截断 */
	biography?: string;
}

/**
 * 视图中的影片卡片字段，与前端推荐卡对齐。
 */
export interface MovieViewItem {
	/** TMDB 影片 id，汇总输出时写入 `id` */
	id: number;
	/** 片名 */
	name: string;
	/** 四位年份 */
	year?: string;
	/** 相对路径，如 `/xxx.jpg` */
	poster_path?: string;
}

/**
 * Agent publish 给汇总的精简证据。不要把 TMDB 原始对象放进来。
 */
export interface AgentEvidenceView {
	/** 汇总应按哪种形态回答 */
	answer: ViewAnswerKind;
	/** 人物卡片，answer 为 people / fact 时常用 */
	people?: PersonViewItem[];
	/** 影片卡片，条数已按视图上限截过 */
	movies?: MovieViewItem[];
	/** 候选条数、截断与否等，给模型当上下文不要当片单 */
	stats?: Record<string, number | string | boolean>;
}

/**
 * 写入工作流历史的可见角色，与 ChatItem.role 对齐。
 */
export const MESSAGE_ROLE = {
	/** 用户气泡 */
	USER: "user",
	/** 助手气泡 */
	ASSISTANT: "assistant",
} as const;

/**
 * {@link MESSAGE_ROLE} 的字面量联合。
 */
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

/**
 * 对话历史写入 prompt 的阶段。各阶段条数上限见 `HISTORY_PROJECTION`。
 */
export const HISTORY_PROJECTION_KIND = {
	/** 意图识别 prompt */
	INTENT: "intent",
	/** 任务规划 prompt */
	PLANNING: "planning",
	/** Search 选工具 prompt */
	SEARCH: "search",
	/** 汇总成推荐 JSON 的 prompt */
	SYNTHESIS: "synthesis",
} as const;

/**
 * {@link HISTORY_PROJECTION_KIND} 的字面量联合。
 */
export type HistoryProjectionKind =
	(typeof HISTORY_PROJECTION_KIND)[keyof typeof HISTORY_PROJECTION_KIND];

/**
 * LLM 历史里的一轮可见对话，只含投影用文本。
 */
export interface ConversationHistoryItem {
	/** 用户或助手 */
	role: MessageRole;
	/** 用户为提问原文；助手为压缩后的推荐说明 */
	content: string;
}

/**
 * 从该用户**其它会话**里语义召回的一条长期记忆。
 * 与 {@link ConversationHistoryItem} 是两类上下文：历史按时间序，记忆按相似度。
 */
export interface ConversationMemory {
	/** 自包含的一句话记忆，可直接进 prompt */
	text: string;
	/** COSINE 相似度，越大越相关。已在 message-service 侧过掉低分命中 */
	score: number;
}
