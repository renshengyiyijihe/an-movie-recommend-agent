import { Injectable, Logger } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ModelProvider } from "../model/model.provider";
import { LangSmithProvider } from "../model/langsmith.provider";
import {
  TmdbProvider,
  TmdbDiscoverMovieQueryParamsDto,
  type TMDBDiscoverMovieQueryParams,
  type TMDBMovieResult,
} from "../model/tmdb.provider";
import { AuthGrpcClient } from "./auth.grpc";
import { MessageGrpcClient } from "./message.grpc";
import { genreToTmdbGenreIdMap, languageToTmdbLanguageMap } from "./config";
import { WorkflowPlanner, type StageName } from "./workflow.planner";

interface MoviePreference {
  genre?: string;
  mood?: string;
  actors?: string;
  length?: string;
  rating?: string;
  language?: string;
  scene?: string;
  theme?: string;
}

interface ConversationHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface RecommendPayload {
  message: string;
  preferences?: MoviePreference;
  imageUrl?: string;
  imageData?: string;
  history?: ConversationHistoryItem[];
  conversationId?: string;
}

interface WorkflowContext {
  message: string;
  preferences?: MoviePreference;
  imageUrl?: string;
  imageData?: string;
  conversationHistory?: string;
}

interface WorkflowState {
  message: string;
  imageUrl?: string;
  imageData?: string;
  preferences: string;
  searchResult: string;
  supervisorResult: string;
  conversationHistory: string;
}

interface TmdbSearchRequest {
  params?: Partial<TMDBDiscoverMovieQueryParams>;
  query?: string;
}

interface TmdbSearchResponse {
  query?: string | Partial<TMDBDiscoverMovieQueryParams>;
  results?: TMDBMovieResult[];
  request_id?: string;
}

type IntentType = "movie_recommendation" | "out_of_scope";

const MAX_PROMPT_TEXT_LENGTH = 2500;
const MAX_SEARCH_RESULT_LENGTH = 4000;
const MAX_IMAGE_DATA_LENGTH = 1200;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

@Injectable()
export class MovieService {
  private readonly logger = new Logger(MovieService.name);
  private readonly workflowPlanner = new WorkflowPlanner(this.logger);

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly langsmithProvider: LangSmithProvider,
    private readonly tmdbProvider: TmdbProvider,
    private readonly authGrpcClient: AuthGrpcClient,
    private readonly messageGrpcClient: MessageGrpcClient,
  ) {}

  async recommend(payload: RecommendPayload, authorization?: string) {
    this.logger.log(
      `recommend request received: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}, authHeader=${authorization ? "present" : "absent"}`,
    );
    const preferences = this.normalizePreferences(payload.preferences);

    const authResult = authorization
      ? await this.validateAuthorization(authorization)
      : { ok: false, error: "no_authorization_header" };
    this.logger.log(
      `authorization check: ok=${authResult.ok}, error=${authResult.error ?? "none"}, user=${authResult.user?.email ?? "anonymous"}`,
    );

    const conversationId = await this.ensureConversation(payload, authResult);

    await this.appendConversationMessage(
      conversationId,
      'user',
      'user_query',
      'submit',
      payload.message,
    );

    const intent = await this.classifyIntent(payload.message);
    await this.appendConversationMessage(
      conversationId,
      'assistant',
      'agent_execution',
      'intent_classification',
      intent,
    );
    if (intent !== "movie_recommendation") {
      this.logger.warn(
        `Non-movie request rejected: ${this.truncateText(payload.message, 200)}`,
      );
      return {
        type: "reject",
        data: {
          preferences,
          message:
            "我主要负责电影推荐。如果你想问电影类型、演员、风格、时长或推荐电影，我可以继续帮你。",
        },
      };
    }

    const model = this.modelProvider.getModel();
    if (!model) {
      this.logger.error("LLM model not configured; aborting recommendation workflow");
      return this.buildErrorResponse(payload, preferences, {
        stage: "model",
        message: "模型未配置，无法执行推荐",
        details: "ModelProvider 未返回可用模型",
      });
    }

    const context: WorkflowContext = {
      message: payload.message,
      preferences,
      imageUrl: payload.imageUrl,
      imageData: payload.imageData,
      conversationHistory: this.buildConversationHistory(payload.history),
    };

    try {
      this.logger.log(
        `Starting movie recommendation workflow message=${this.truncateText(payload.message, 200)} history=${this.truncateText(this.buildConversationHistory(payload.history), 200)}`,
      );
      const result = await this.runLangGraphWorkflow(context);
      this.logger.log(
        `Workflow finished: preferences=${this.truncateText(result.preferences, 400)} searchResult=${this.truncateText(result.searchResult, 400)} supervisorResult=${this.truncateText(result.supervisorResult, 400)}`,
      );

      await this.appendConversationMessage(
        conversationId,
        'assistant',
        'agent_execution',
        'workflow_complete',
        JSON.stringify({
          preferences: result.preferences,
          searchResult: result.searchResult,
          supervisorResult: result.supervisorResult,
        }),
      );

      const langsmithEnabled = !!this.langsmithProvider.getClient();
      if (langsmithEnabled) {
        await this.langsmithProvider.createRun(
          "电影推荐请求",
          {
            user_message: this.truncateText(payload.message, 500),
            has_image: !!payload.imageData,
            image_url: payload.imageUrl ?? undefined,
          },
          {
            supervisor_output: this.truncateText(result.supervisorResult, 1000),
            stage_outputs: {
              preferences: this.truncateText(result.preferences, 1000),
              searchResult: this.truncateText(result.searchResult, 1000),
            },
          },
          {
            stage: "workflow",
            langchain_workflow: "movie_recommendation",
          },
        );
      }

      const parsed = this.parseRecommendation(
        result.supervisorResult,
        preferences,
        result.searchResult,
      );
      this.logger.log(
        `Recommendation result ready: preferences ->> ${JSON.stringify(parsed.preferences)} \n recommendations ->> ${JSON.stringify(parsed.recommendations)}`,
      );

      await this.appendConversationMessage(
        conversationId,
        'assistant',
        'final_response',
        'final',
        JSON.stringify({
          preferences: parsed.preferences,
          recommendations: parsed.recommendations,
          explanation: parsed.explanation,
          message: parsed.message,
          fallback_reason: parsed.fallback_reason,
        }),
      );

      return {
        conversationId,
        type: "success",
        data: {
          preferences: parsed.preferences,
          recommendations: parsed.recommendations,
          explanation: parsed.explanation,
          message: parsed.message,
          fallback_reason: parsed.fallback_reason,
        },
        stageOutputs: {
          preferences: result.preferences,
          searchResult: result.searchResult,
        },
        monitoring: {
          langsmith: langsmithEnabled,
        },
      };
    } catch (error) {
      const workflowError = error as Error & {
        stage?: string;
        details?: string;
      };
      this.logger.error(
        `Workflow failed: stage=${workflowError.stage ?? "unknown"} message=${workflowError.message} details=${workflowError.details ?? "none"}`,
        workflowError,
      );
      const response = this.buildErrorResponse(payload, preferences, {
        stage: workflowError.stage ?? "workflow",
        message: workflowError.message ?? "推荐工作流执行失败",
        details: workflowError.details ?? "请查看服务日志获取完整上下文",
      });
      if (conversationId) {
        await this.appendConversationMessage(
          conversationId,
          'assistant',
          'final_response',
          'final',
          JSON.stringify({ error: response }),
        ).catch(() => undefined);
      }
      return response;
    }
  }

  private async ensureConversation(payload: RecommendPayload, authResult: { ok: boolean; user?: { id: string; email: string } }) {
    if (payload.conversationId) {
      return payload.conversationId;
    }

    try {
      const createResponse = await this.messageGrpcClient.createConversation({
        user_id: authResult.ok ? authResult.user?.id : undefined,
        title: payload.message?.slice(0, 120),
      });
      return createResponse.conversation_id;
    } catch (error) {
      this.logger.warn('Failed to create conversation via message service, continuing without conversation tracking');
      return '';
    }
  }

  private async appendConversationMessage(
    conversationId: string,
    role: string,
    messageType: string,
    stage: string,
    content: string,
  ) {
    if (!conversationId) {
      return;
    }

    try {
      await this.messageGrpcClient.appendMessage({
        conversation_id: conversationId,
        role,
        message_type: messageType,
        stage,
        content,
      });
    } catch (error) {
      this.logger.warn('Failed to append conversation message', error as Error);
    }
  }

  private buildSystemPrompt() {
    return [
      "你是一个电影推荐专家智能体。",
      "根据用户描述的影片类型、心情、演员、时长、评分偏好，给出 3-4 个推荐。",
      "如果用户提供了图片，请简要分析图片里的风格、场景或情绪。",
      "输出格式必须为 JSON，包含 fields: recommendations, explanation。如无法生成推荐，可使用 fallback_reason 说明失败原因。",
    ].join("\n");
  }

  private async classifyIntent(message: string): Promise<IntentType> {
    const normalized = message.trim();
    this.logger.log(`classifyIntent start: messageLength=${normalized.length}`);
    if (!normalized) {
      this.logger.warn("classifyIntent rejected empty message");
      return "out_of_scope";
    }

    try {
      const model = this.modelProvider.getModel();
      if (!model) {
        this.logger.warn(
          "classifyIntent could not run because model is unavailable",
        );
        return "out_of_scope";
      }

      const response = await model.invoke([
        [
          "system",
          "你是一个意图分类器。请判断用户问题是否与“电影推荐”相关。只输出一个词：movie_recommendation 或 out_of_scope。",
        ],
        ["user", `用户输入: ${normalized}`],
      ]);

      const text = this.extractText(response.content).trim().toLowerCase();
      const intent = text.includes("movie_recommendation")
        ? "movie_recommendation"
        : "out_of_scope";
      this.logger.log(
        `classifyIntent finished: intent=${intent}, rawResponse=${this.truncateText(text, 200)}`,
      );
      return intent;
    } catch (error) {
      this.logger.warn(`意图识别失败，默认拒绝: ${(error as Error).message}`);
      return "out_of_scope";
    }
  }

  private async validateAuthorization(
    authorization: string,
  ): Promise<{
    ok: boolean;
    user?: { id: string; email: string };
    error?: string;
  }> {
    this.logger.log(
      `validateAuthorization start: authLength=${authorization.length}`,
    );
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      this.logger.warn("validateAuthorization failed: no bearer token found");
      return { ok: false, error: "no_token" };
    }

    try {
      const response = await this.authGrpcClient.validateToken(token);
      if (!response.ok) {
        this.logger.warn(
          `validateAuthorization failed: ${response.error ?? "unknown error"}`,
        );
        return { ok: false, error: response.error ?? "invalid_token" };
      }

      this.logger.log(
        `validateAuthorization success: user=${response.user?.email ?? response.user?.id ?? "unknown"}`,
      );
      return {
        ok: true,
        user: {
          id: response.user?.id ?? "",
          email: response.user?.email ?? "",
        },
      };
    } catch (error) {
      this.logger.error("validateAuthorization exception", error as Error);
      return { ok: false, error: "grpc_error" };
    }
  }

  private async runLangGraphWorkflow(context: WorkflowContext) {
    const initialState: WorkflowState = {
      message: this.truncateText(context.message, MAX_PROMPT_TEXT_LENGTH),
      imageUrl: context.imageUrl,
      imageData: this.sanitizeImageData(context.imageData),
      preferences: this.stringifyPreferences(context.preferences),
      searchResult: "",
      supervisorResult: "",
      conversationHistory: this.truncateText(
        context.conversationHistory,
        MAX_PROMPT_TEXT_LENGTH,
      ),
    };

    const plannerResult = await this.planWorkflowStages(context);
    const state = { ...initialState };

    this.logger.log(
      `workflow planner raw=${plannerResult.rawPlan} plan=${plannerResult.plan.join(" -> ")}`,
    );

    for (const stage of plannerResult.plan) {
      this.logger.log(`workflow executing stage=${stage}`);
      switch (stage) {
        case "parsePreferences": {
          const content = await this.runPreferenceExtractionWithValidation(state);
          const parsedPreferences = this.parseStructuredPreferences(content, state);
          state.preferences = this.stringifyPreferences(parsedPreferences);
          this.logger.log(
            `workflow stage completed stage=parsePreferences preferences=${state.preferences}`,
          );
          break;
        }
        case "search": {
          const content = await this.runTmdbSearch(state);
          state.searchResult = content;
          this.logger.log(
            `workflow stage completed stage=search searchResult=${this.truncateText(content, 400)}`,
          );
          break;
        }
        case "supervisor": {
          const prompt = this.buildSupervisorPrompt(state);
          this.logger.log(`supervisor prompt:\n${prompt}`);
          const content = await this.runAgentNode("supervisor", prompt);
          state.supervisorResult = content;
          this.logger.log(
            `workflow stage completed stage=supervisor supervisorResult=${this.truncateText(content, 400)}`,
          );
          break;
        }
        default:
          throw new Error(`未知阶段: ${stage}`);
      }
    }

    return {
      preferences: state.preferences || "",
      searchResult: state.searchResult || "",
      supervisorResult: state.supervisorResult || "",
    };
  }

  private async planWorkflowStages(
    context: WorkflowContext,
  ) {
    const model = this.modelProvider.getModel();
    return this.workflowPlanner.plan(
      {
        message: context.message,
        conversationHistory: context.conversationHistory,
      },
      model,
    );
  }

  private async runAgentNode(stage: StageName, prompt: string) {
    const model = this.modelProvider.getModel();
    if (!model) {
      throw new Error(`阶段 ${stage} 失败：模型未配置`);
    }

    this.logger.log(`runAgentNode start stage=${stage} prompt=\n${prompt}`);

    return this.runWithRetry(stage, async () => {
      try {
        const response = await model.invoke([
          ["system", this.buildStageInstruction(stage)],
          ["user", this.truncateText(prompt, MAX_PROMPT_TEXT_LENGTH)],
        ]);
        const text = this.extractText(response.content);
        this.logger.log(
          `runAgentNode response stage=${stage} content=${this.truncateText(text, 400)}`,
        );
        return text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`runAgentNode failed stage=${stage} error=${message}`, error);
        throw error;
      }
    });
  }

  private async runTmdbSearch(state: WorkflowState) {
    if (!this.tmdbProvider.isEnabled()) {
      throw new Error("TMDB 未配置，无法执行搜索阶段");
    }

    const request = this.buildTmdbQuery(state);
    this.logger.log(`runTmdbSearch start query=${request.query ?? ""}`);

    const validationError = await this.validateTmdbQueryParams(
      request.params ?? {},
    );
    if (validationError) {
      throw new Error(`TMDB 查询参数校验失败: ${validationError}`);
    }

    return this.runWithRetry("search", async () => {
      try {
        const response = await this.tmdbProvider.search(request.params ?? {}, {
          max_results: 4,
        });

        const summary = this.buildStructuredSearchSummary(response);
        this.logger.log(`runTmdbSearch success summary=${summary}`);
        return summary;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`runTmdbSearch failed error=${message}`, error);
        throw error;
      }
    });
  }

  private buildStructuredSearchSummary(response: TmdbSearchResponse) {
    const results = (response.results ?? []).map((item) => {
      const overview = this.normalizeText(item.overview);
      const summary = this.summarizeText(overview, 160);
      const posterPath = item.poster_path ?? "";
      const backdropPath = item.backdrop_path ?? "";

      return {
        adult: item.adult ?? false,
        poster_path: item.poster_path ?? null,
        id: item.id ?? undefined,
        backdrop_path: item.backdrop_path ?? null,
        genre_ids: item.genre_ids ?? [],
        original_language: item.original_language ?? "",
        original_title: item.original_title ?? "",
        overview,
        popularity: item.popularity ?? 0,
        release_date: item.release_date ?? "",
        title: this.normalizeText(item.title),
        video: item.video ?? false,
        vote_average: item.vote_average ?? 0,
        vote_count: item.vote_count ?? 0,
        tmdb_url: item.id ? `https://www.themoviedb.org/movie/${item.id}` : "",
        poster_url: posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : "",
        backdrop_url: backdropPath ? `${TMDB_IMAGE_BASE_URL}${backdropPath}` : "",
        summary,
        truncated: overview.length > 220,
      };
    });

    return JSON.stringify({
      query:
        typeof response.query === "string"
          ? this.normalizeText(response.query)
          : this.normalizeText(JSON.stringify(response.query ?? {})),
      results,
      request_id: response.request_id ?? "",
    });
  }

  private normalizeText(text?: string): string {
    if (!text) {
      return "";
    }

    return text.replace(/\s+/g, " ").trim();
  }

  private summarizeText(text: string, maxLength = 140): string {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return "";
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
  }


  private buildTmdbQuery(state: WorkflowState): TmdbSearchRequest {
    const preferences = this.normalizePreferences(state.preferences);
    const params = this.buildTmdbQueryParamsFromPreferences(preferences);

    const query = [
      preferences.genre,
      preferences.mood,
      preferences.actors,
      preferences.theme,
      preferences.scene,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      params: Object.keys(params).length > 0 ? params : undefined,
      query: query || "电影推荐",
    };
  }

  private buildParsePrompt(state: WorkflowState) {
    const promptState = this.buildPromptState(state);
    const existingPreferences = this.stringifyPreferences(
      this.normalizePreferences(promptState.preferences),
    );
    const lines = [
      "请从用户输入中提取结构化偏好。",
      "必须输出一个纯 JSON 对象，字段仅限：genre, mood, actors, length, rating, language, scene, theme。",
      "如果某项无法确定，请使用空字符串。",
      "生成后必须能被转换为 TMDBDiscoverMovieQueryParams 兼容的查询结构。",
      "例如：genre 需要是类型字符串，rating 需要是可提取评分值的字符串，length 需要是时长字符串。",
      `用户输入: ${promptState.message}`,
      promptState.imageUrl ? `图片链接: ${promptState.imageUrl}` : "",
      promptState.imageData ? "已上传图片，请分析其情绪和风格。" : "",
      promptState.conversationHistory
        ? `历史对话上下文:\n${promptState.conversationHistory}`
        : "",
      `已知偏好: ${existingPreferences}`,
      '输出示例: {"genre":"科幻","mood":"紧张刺激","actors":"汤姆·克鲁斯","length":"2小时以内","rating":"8分以上","language":"英文","scene":"适合晚上看","theme":"成长"}',
    ];
    return lines.filter(Boolean).join("\n");
  }


  private buildSupervisorPrompt(state: WorkflowState) {
    const promptState = this.buildPromptState(state);
    return [
      "你是监督智能体，将搜索结果整合为最终答案。",
      `用户输入: ${promptState.message}`,
      promptState.imageUrl ? `图片链接: ${promptState.imageUrl}` : "",
      promptState.imageData ? "附带已上传图片分析。" : "",
      promptState.conversationHistory
        ? `历史对话上下文:\n${promptState.conversationHistory}`
        : "",
      `用户偏好: ${promptState.preferences}`,
      `搜索结果: ${promptState.searchResult}`,
      "输出 JSON，包含 recommendations、explanation、preferences。仅在无法生成推荐时，使用 fallback_reason 说明原因。",
    ].join("\n");
  }

  private buildStageInstruction(stage: StageName) {
    switch (stage) {
      case "parsePreferences":
        return [
          "你是偏好提取智能体。",
          "从用户输入中提取电影类型、剧情风格、演员偏好、时长、评分、语言、观看场景和情绪。",
          "输出必须是一个纯 JSON 对象，字段仅限 genre, mood, actors, length, rating, language, scene, theme。",
          "如果无法确定，请使用空字符串。",
        ].join("\n");
      case "search":
        return [
          "你是搜索智能体。",
          "基于用户偏好推荐电影。",
          "输出 JSON，不要包含多余文本。",
        ].join("\n");
      case "supervisor":
        return [
          "你是监督智能体。",
          "整合搜索和链接结果，给出最终可直接展示给用户的回答。",
          "输出 JSON。",
        ].join("\n");
      default:
        return this.buildSystemPrompt();
    }
  }

  private async runWithRetry<T>(
    stage: StageName,
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`Stage ${stage} attempt ${attempt} started`);
        const result = await operation();
        this.logger.log(`Stage ${stage} attempt ${attempt} succeeded`);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Stage ${stage} attempt ${attempt}/${MAX_RETRIES} failed: ${message}`,
          error,
        );
        if (attempt === MAX_RETRIES) break;
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BACKOFF_MS * attempt),
        );
      }
    }
    const finalError = new Error(`Stage ${stage} failed after ${MAX_RETRIES} attempts`);
    this.logger.error(`Stage ${stage} exhausted retries`, finalError);
    throw finalError;
  }

  private truncateText(
    text: string | undefined,
    maxLength = MAX_PROMPT_TEXT_LENGTH,
  ): string {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n...[truncated]`;
  }

  private sanitizeImageData(imageData?: string): string | undefined {
    if (!imageData) return undefined;
    if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
      return `[image-data-truncated:${imageData.length} chars]`;
    }
    return imageData;
  }

  private buildPromptState(state: WorkflowState) {
    return {
      message: this.truncateText(state.message, MAX_PROMPT_TEXT_LENGTH),
      preferences: this.truncateText(state.preferences, MAX_PROMPT_TEXT_LENGTH),
      searchResult: this.truncateText(
        state.searchResult,
        MAX_SEARCH_RESULT_LENGTH,
      ),
      conversationHistory: this.truncateText(
        state.conversationHistory,
        MAX_PROMPT_TEXT_LENGTH,
      ),
      imageUrl: state.imageUrl,
      imageData: this.sanitizeImageData(state.imageData),
    };
  }

  private buildConversationHistory(
    history?: ConversationHistoryItem[],
  ): string {
    if (!history || history.length === 0) {
      return "";
    }

    return history
      .filter((item) => !!item?.content)
      .map((item) => {
        const roleLabel = item.role === "user" ? "用户" : "助手";
        return `${roleLabel}: ${this.normalizeText(item.content)}`;
      })
      .join("\n");
  }

  private extractText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join("\n");
    }
    if (typeof content === "object" && content !== null)
      return JSON.stringify(content);
    return String(content ?? "");
  }

  private buildErrorResponse(
    payload: RecommendPayload,
    preferences: MoviePreference,
    error: { stage: string; message: string; details?: string },
  ) {
    return {
      type: "error",
      data: {
        preferences,
        message: `推荐流程执行失败：${error.message}`,
        fallback_reason: error.message,
        error: {
          stage: error.stage,
          message: error.message,
          details: error.details ?? "无额外详情",
          requestMessage: payload.message,
        },
      },
    };
  }

  private async runPreferenceExtractionWithValidation(
    state: WorkflowState,
  ): Promise<string> {
    const basePrompt = this.buildParsePrompt(state);
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const prompt =
        attempt === 1
          ? basePrompt
          : `${basePrompt}\n\n上一次生成的数据结构校验失败：${lastError}\n请严格按照要求重新生成一个只包含 genre, mood, actors, length, rating, language, scene, theme 的 JSON 对象，并确保字段值可被成功映射到 TMDB 查询参数。`;

      const content = await this.runAgentNode("parsePreferences", prompt);
      this.logger.log(
        `[parsePreferences] attempt ${attempt} rawContentLength=${content.length} content=${content}`,
      );
      const parsed = this.tryParseJsonObject<Partial<MoviePreference>>(
        content,
        `parsePreferences-attempt-${attempt}`,
      );
      if (!parsed) {
        lastError = "返回内容不是合法的 JSON 对象。";
        this.logger.warn(
          `[parsePreferences] attempt ${attempt} failed: ${lastError}`,
        );
        continue;
      }

      this.logger.log(
        `[parsePreferences] attempt ${attempt} parsedPreferences=${JSON.stringify(parsed)}`,
      );
      const preferences = this.normalizePreferences(parsed);
      const tmdbQueryParams =
        this.buildTmdbQueryParamsFromPreferences(preferences);
      this.logger.log(
        `[parsePreferences] attempt ${attempt} tmdbQueryParams=${JSON.stringify(tmdbQueryParams)}`,
      );
      const validationError =
        await this.validateTmdbQueryParams(tmdbQueryParams);
      if (!validationError) {
        return content;
      }

      lastError = validationError;
      this.logger.warn(
        `[parsePreferences] attempt ${attempt} validation failed: ${lastError}`,
      );
    }

    throw new Error(`偏好提取失败: ${lastError || "未能生成合法偏好"}`);
  }

  private parseStructuredPreferences(
    content: string,
    state: WorkflowState,
  ): MoviePreference {
    this.logger.log(
      `[parseStructuredPreferences] start: contentLength=${content.length} content=${content}`,
    );
    const parsed = this.tryParseJsonObject<Partial<MoviePreference>>(
      content,
      "parseStructuredPreferences",
    );
    const fromState = this.normalizePreferences(state.preferences);
    const merged = this.mergePreferences(fromState, parsed ?? {});
    this.logger.log(
      `[parseStructuredPreferences] parsed=${JSON.stringify(parsed ?? {})} merged=${JSON.stringify(merged)}`,
    );
    return merged;
  }

  private normalizePreferences(
    preferences?: Partial<MoviePreference> | string | null,
  ): MoviePreference {
    if (!preferences) {
      return {};
    }

    if (typeof preferences === "string") {
      const trimmed = preferences.trim();
      if (!trimmed) {
        return {};
      }

      this.logger.log(
        `[normalizePreferences] parsing string input: length=${trimmed.length} content=${trimmed}`,
      );
      const parsed = this.tryParseJsonObject<Partial<MoviePreference>>(
        trimmed,
        "normalizePreferences",
      );
      if (parsed) {
        this.logger.log(
          `[normalizePreferences] parsed string input -> ${JSON.stringify(parsed)}`,
        );
        return this.normalizePreferences(parsed);
      }

      this.logger.warn(
        `[normalizePreferences] failed to parse string input: ${trimmed}`,
      );
      return {};
    }

    return {
      genre: this.normalizePreferenceValue(preferences.genre),
      mood: this.normalizePreferenceValue(preferences.mood),
      actors: this.normalizePreferenceValue(preferences.actors),
      length: this.normalizePreferenceValue(preferences.length),
      rating: this.normalizePreferenceValue(preferences.rating),
      language: this.normalizePreferenceValue(preferences.language),
      scene: this.normalizePreferenceValue(preferences.scene),
      theme: this.normalizePreferenceValue(preferences.theme),
    };
  }

  private mergePreferences(
    base: MoviePreference,
    incoming: Partial<MoviePreference> = {},
  ): MoviePreference {
    return {
      genre: this.normalizePreferenceValue(incoming.genre ?? base.genre),
      mood: this.normalizePreferenceValue(incoming.mood ?? base.mood),
      actors: this.normalizePreferenceValue(incoming.actors ?? base.actors),
      length: this.normalizePreferenceValue(incoming.length ?? base.length),
      rating: this.normalizePreferenceValue(incoming.rating ?? base.rating),
      language: this.normalizePreferenceValue(
        incoming.language ?? base.language,
      ),
      scene: this.normalizePreferenceValue(incoming.scene ?? base.scene),
      theme: this.normalizePreferenceValue(incoming.theme ?? base.theme),
    };
  }

  private stringifyPreferences(preferences?: Partial<MoviePreference>): string {
    return JSON.stringify(this.normalizePreferences(preferences));
  }

  private normalizePreferenceValue(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value === undefined || value === null) {
      return "";
    }
    return String(value).trim();
  }

  private tryParseJsonObject<T = Partial<MoviePreference>>(
    value: string,
    stage = "unknown",
  ): T | null {
    const trimmed = value.trim();
    if (!trimmed) {
      this.logger.warn(`[${stage}] empty input for JSON parse`);
      return null;
    }

    this.logger.log(
      `[${stage}] parse start: inputLength=${trimmed.length} content=${trimmed}`,
    );
    const candidate = this.extractJsonCandidate(trimmed);
    this.logger.log(
      `[${stage}] candidateLength=${candidate?.length ?? 0} candidate=${candidate}`,
    );
    if (!candidate) {
      this.logger.warn(`[${stage}] no JSON candidate extracted`);
      return null;
    }

    try {
      const sanitized = this.sanitizeJsonLikeText(candidate);
      this.logger.log(
        `[${stage}] sanitizedLength=${sanitized.length} sanitized=${sanitized}`,
      );
      const parsed = JSON.parse(sanitized);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.logger.log(
          `[${stage}] parsed object successfully: ${JSON.stringify(parsed)}`,
        );
        return parsed as T;
      }
      this.logger.warn(`[${stage}] parsed value is not a plain object`);
      return null;
    } catch (error) {
      this.logger.warn(
        `[${stage}] JSON parse failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private extractJsonCandidate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      this.logger.log(
        `[extractJsonCandidate] found fenced JSON block: length=${fenced[1].trim().length}`,
      );
      return fenced[1].trim();
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      this.logger.log(
        `[extractJsonCandidate] sliced from ${start} to ${end}`,
      );
      return trimmed.slice(start, end + 1);
    }

    this.logger.warn(`[extractJsonCandidate] no JSON braces found`);
    return trimmed;
  }

  private sanitizeJsonLikeText(value: string): string {
    let text = value.trim();
    this.logger.log(
      `[sanitizeJsonLikeText] inputLength=${text.length} input=${text}`,
    );
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "");
    text = text.replace(/[\u0000-\u001f]/g, (char) => {
      if (char === "\n" || char === "\r" || char === "\t") {
        return char;
      }
      return " ";
    });

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }

    let result = "";
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        escaped = true;
        continue;
      }

      if (char === '"') {
        if (!inString) {
          inString = true;
          result += char;
          continue;
        }

        const next = this.peekNonWhitespaceChar(text, index + 1);
        const shouldCloseString =
          next === ":" || next === "," || next === "}" || next === "]" || next === undefined;

        if (shouldCloseString) {
          inString = false;
          result += char;
          continue;
        }

        result += '\\"';
        continue;
      }

      if (char === "\n" || char === "\r" || char === "\t") {
        result += " ";
        continue;
      }

      result += char;
    }

    this.logger.log(
      `[sanitizeJsonLikeText] outputLength=${result.length} output=${result}`,
    );
    return result;
  }

  private peekNonWhitespaceChar(text: string, startIndex: number): string | undefined {
    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];
      if (/\s/.test(char)) {
        continue;
      }
      return char;
    }
    return undefined;
  }

  private buildTmdbQueryParamsFromPreferences(
    preferences: MoviePreference,
  ): Partial<TMDBDiscoverMovieQueryParams> {
    const params: Partial<TMDBDiscoverMovieQueryParams> = {};

    if (preferences.genre) {
      const genreId = this.mapGenreToTmdbGenreId(preferences.genre);
      if (genreId) {
        params.with_genres = genreId;
      }
    }

    if (preferences.rating) {
      const rating = this.extractNumber(preferences.rating);
      if (rating !== null) {
        params["vote_average.gte"] = rating;
      }
    }

    if (preferences.length) {
      const runtime = this.extractRuntimeMinutes(preferences.length);
      if (runtime !== null) {
        params["with_runtime.lte"] = runtime;
      }
    }

    if (preferences.language) {
      const language = this.mapLanguageToTmdb(preferences.language);
      if (language) {
        params.with_original_language = language;
      }
    }

    return params;
  }

  private async validateTmdbQueryParams(
    params: Partial<TMDBDiscoverMovieQueryParams>,
  ): Promise<string | null> {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return "TMDB 查询参数必须是一个对象。";
    }

    const dto = plainToInstance(TmdbDiscoverMovieQueryParamsDto, params);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
    });

    if (errors.length === 0) {
      return null;
    }

    const firstError = errors[0];
    const message = firstError.constraints
      ? Object.values(firstError.constraints)[0]
      : "参数校验失败";
    return message;
  }

  private mapGenreToTmdbGenreId(genre: string): string | undefined {
    const normalized = genre.trim().toLowerCase();
    return genreToTmdbGenreIdMap[normalized];
  }

  private extractNumber(value: string): number | null {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return null;
    }
    return Number(match[1]);
  }

  private extractRuntimeMinutes(value: string): number | null {
    const normalized = value.toLowerCase();
    const match = normalized.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return null;
    }

    const number = Number(match[1]);
    if (
      normalized.includes("小时") ||
      normalized.includes("hr") ||
      normalized.includes("h")
    ) {
      return Math.round(number * 60);
    }

    if (
      normalized.includes("分钟") ||
      normalized.includes("min") ||
      normalized.includes("m")
    ) {
      return Math.round(number);
    }

    return null;
  }

  private mapLanguageToTmdb(language: string): string | undefined {
    const normalized = language.trim().toLowerCase();
    return languageToTmdbLanguageMap[normalized];
  }

  private parseSearchResultMetadata(searchResult: string): Array<Record<string, unknown>> {
    if (!searchResult) {
      return [];
    }

    const parsed = this.tryParseJsonObject<Record<string, unknown>>(
      searchResult,
      "parseSearchResultMetadata",
    );
    const results = parsed?.results;
    if (!Array.isArray(results)) {
      return [];
    }

    return results.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }

  private getStringValue(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }

  private matchTmdbMovie(
    recommendation: Record<string, unknown>,
    movie: Record<string, unknown>,
  ): boolean {
    const targetTitles = [
      this.getStringValue(recommendation.name),
      this.getStringValue(recommendation.title),
      this.getStringValue(recommendation.original_title),
    ];
    const movieTitles = [
      this.getStringValue(movie.title),
      this.getStringValue(movie.original_title),
    ];

    return targetTitles.some((targetTitle) => {
      if (!targetTitle) {
        return false;
      }
      const normalizedTarget = this.normalizeText(targetTitle);
      if (!normalizedTarget) {
        return false;
      }
      return movieTitles.some((movieTitle) => {
        const normalizedMovieTitle = this.normalizeText(movieTitle);
        if (!normalizedMovieTitle) {
          return false;
        }
        return (
          normalizedTarget === normalizedMovieTitle ||
          normalizedTarget.includes(normalizedMovieTitle) ||
          normalizedMovieTitle.includes(normalizedTarget)
        );
      });
    });
  }

  private enrichRecommendationWithTmdbMetadata(
    recommendation: Record<string, unknown>,
    movie: Record<string, unknown>,
  ) {
    return {
      ...recommendation,
      name: this.getStringValue(recommendation.name) || this.getStringValue(movie.title),
      title: this.getStringValue(recommendation.title) || this.getStringValue(movie.title),
      reason:
        this.getStringValue(recommendation.reason) ||
        this.getStringValue(movie.summary),
      summary:
        this.getStringValue(recommendation.summary) ||
        this.getStringValue(movie.summary),
      overview:
        this.getStringValue(recommendation.overview) ||
        this.getStringValue(movie.overview),
      release_date:
        this.getStringValue(recommendation.release_date) ||
        this.getStringValue(movie.release_date),
      vote_average:
        recommendation.vote_average ?? movie.vote_average ?? undefined,
      vote_count:
        recommendation.vote_count ?? movie.vote_count ?? undefined,
      popularity:
        recommendation.popularity ?? movie.popularity ?? undefined,
      original_language:
        this.getStringValue(recommendation.original_language) ||
        this.getStringValue(movie.original_language),
      genre_ids: Array.isArray(recommendation.genre_ids)
        ? recommendation.genre_ids
        : Array.isArray(movie.genre_ids)
          ? movie.genre_ids
          : [],
      poster_path: recommendation.poster_path ?? movie.poster_path ?? null,
      poster_url: this.getStringValue(recommendation.poster_url) || this.getStringValue(movie.poster_url),
      backdrop_path: recommendation.backdrop_path ?? movie.backdrop_path ?? null,
      backdrop_url: this.getStringValue(recommendation.backdrop_url) || this.getStringValue(movie.backdrop_url),
      tmdb_url: this.getStringValue(recommendation.tmdb_url) || this.getStringValue(movie.tmdb_url),
      id: recommendation.id ?? movie.id ?? undefined,
      adult: recommendation.adult ?? movie.adult ?? false,
      video: recommendation.video ?? movie.video ?? false,
      original_title:
        this.getStringValue(recommendation.original_title) ||
        this.getStringValue(movie.original_title),
    };
  }

  private parseRecommendation(
    text: string,
    preferences: MoviePreference,
    searchResult?: string,
  ) {
    this.logger.log(
      `[parseRecommendation] start: textLength=${text.length} text=${text} preferences=${JSON.stringify(preferences)}`,
    );
    try {
      const parsed = this.tryParseJsonObject<Record<string, unknown>>(
        text,
        "parseRecommendation",
      );
      if (!parsed) {
        throw new Error("No JSON found");
      }
      this.logger.log(
        `[parseRecommendation] parsed JSON: ${JSON.stringify(parsed)}`,
      );
      const parsedObject = parsed as Record<string, unknown>;
      const tmdbMovies = this.parseSearchResultMetadata(searchResult ?? "");
      const recommendations = Array.isArray(parsedObject.recommendations)
        ? parsedObject.recommendations
        : [];

      const enrichedRecommendations = recommendations.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return item;
        }

        const recommendation = item as Record<string, unknown>;
        const matchedMovie = tmdbMovies.find((movie) =>
          this.matchTmdbMovie(recommendation, movie),
        );

        return matchedMovie
          ? this.enrichRecommendationWithTmdbMetadata(recommendation, matchedMovie)
          : recommendation;
      });

      return {
        preferences: this.normalizePreferences(
          (parsedObject.preferences as Partial<MoviePreference> | undefined) ??
            preferences,
        ),
        recommendations: enrichedRecommendations,
        explanation:
          typeof parsedObject.explanation === "string"
            ? parsedObject.explanation
            : "",
        message:
          typeof parsedObject.message === "string" ? parsedObject.message : "",
        fallback_reason:
          typeof parsedObject.fallback_reason === "string"
            ? parsedObject.fallback_reason
            : "",
      };
    } catch (err) {
      this.logger.error(
        `[parseRecommendation] failed to parse JSON, returning fallback. err ->> ${JSON.stringify(err)}`,
      );
      return {
        preferences: this.normalizePreferences(preferences),
        recommendations: [],
        message: "解析失败，无法生成推荐。",
        fallback_reason: "无法解析模型输出。",
        explanation: "",
      };
    }
  }
}
