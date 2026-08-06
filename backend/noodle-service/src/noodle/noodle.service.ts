import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ModelProvider } from '../model/model.provider';
import { LangSmithProvider } from '../model/langsmith.provider';
import { TavilyProvider } from '../model/tavily.provider';
import { AuthGrpcClient } from './auth.grpc';

type StageName = 'parsePreferences' | 'search' | 'supervisor';

interface RecommendPayload {
  message: string;
  imageUrl?: string;
  imageData?: string;
}

interface WorkflowContext {
  message: string;
  imageUrl?: string;
  imageData?: string;
}

interface WorkflowState {
  message: string;
  imageUrl?: string;
  imageData?: string;
  preferences: string;
  searchResult: string;
  supervisorResult: string;
}

interface TavilySearchItem {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  query?: string;
  answer?: string;
  results?: TavilySearchItem[];
  request_id?: string;
}

type IntentType = 'noodle_recommendation' | 'out_of_scope';

const MAX_PROMPT_TEXT_LENGTH = 2500;
const MAX_SEARCH_RESULT_LENGTH = 4000;
const MAX_IMAGE_DATA_LENGTH = 1200;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;

const WorkflowStateAnnotation = Annotation.Root({
  message: Annotation<string>({
    reducer: (left: string, right: string) => right || left,
    default: () => '',
  }),
  imageUrl: Annotation<string | undefined>({
    reducer: (left: string | undefined, right: string | undefined) => right ?? left,
    default: () => undefined,
  }),
  imageData: Annotation<string | undefined>({
    reducer: (left: string | undefined, right: string | undefined) => right ?? left,
    default: () => undefined,
  }),
  preferences: Annotation<string>({
    reducer: (left: string, right: string) => right || left,
    default: () => '',
  }),
  searchResult: Annotation<string>({
    reducer: (left: string, right: string) => right || left,
    default: () => '',
  }),
  supervisorResult: Annotation<string>({
    reducer: (left: string, right: string) => right || left,
    default: () => '',
  }),
});

@Injectable()
export class NoodleService {
  private readonly logger = new Logger(NoodleService.name);

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly langsmithProvider: LangSmithProvider,
    private readonly tavilyProvider: TavilyProvider,
    private readonly authGrpcClient: AuthGrpcClient,
  ) {}

  async recommend(payload: RecommendPayload, authorization?: string) {
    this.logger.log(`recommend request received: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}, authHeader=${authorization ? 'present' : 'absent'}`);
    const fallback = this.buildFallbackResponse(payload);

    const authResult = authorization ? await this.validateAuthorization(authorization) : { ok: false, error: 'no_authorization_header' };
    this.logger.log(`authorization check: ok=${authResult.ok}, error=${authResult.error ?? 'none'}, user=${authResult.user?.email ?? 'anonymous'}`);

    const intent = await this.classifyIntent(payload.message);
    if (intent !== 'noodle_recommendation') {
      this.logger.warn(`Non-noodle request rejected: ${this.truncateText(payload.message, 200)}`);
      return {
        type: 'reject',
        data: {
          message: '我主要负责泡面推荐。如果你想问口味、预算、辣度或推荐泡面，我可以继续帮你。',
        },
      };
    }

    const model = this.modelProvider.getModel();
    if (!model) {
      this.logger.warn('LLM model not configured; returning fallback recommendation');
      return fallback;
    }

    const context: WorkflowContext = {
      message: payload.message,
      imageUrl: payload.imageUrl,
      imageData: payload.imageData,
    };

    try {
      this.logger.log('Starting noodle recommendation workflow');
      const result = await this.runLangGraphWorkflow(context);
      this.logger.log(`Workflow finished: result${JSON.stringify(result)}`);

      const langsmithEnabled = !!this.langsmithProvider.getClient();
      if (langsmithEnabled) {
        await this.langsmithProvider.createRun(
          '泡面推荐请求',
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
            stage: 'workflow',
            langchain_workflow: 'noodle_recommendation',
          },
        );
      }

      const parsed = this.parseRecommendation(result.supervisorResult);
      this.logger.log(`Recommendation result ready: parsedType=${typeof parsed}, langsmith=${langsmithEnabled}`);
      return {
        type: 'success',
        data: parsed,
        stageOutputs: {
          preferences: result.preferences,
          searchResult: result.searchResult,
        },
        monitoring: {
          langsmith: langsmithEnabled,
        },
      };
    } catch (error) {
      this.logger.warn('Workflow failed, using fallback', error as Error);
      return fallback;
    }
  }

  private buildSystemPrompt() {
    return [
      '你是一个泡面推荐专家智能体。',
      '根据用户描述的口味、价格、偏好，给出 3-4 个推荐。',
      '如果用户提供了图片，请简要分析图片里的风格或情绪。',
      '输出格式必须为 JSON，包含 fields: recommendations, explanation。如无法生成推荐，可使用 fallback_reason 说明失败原因。',
    ].join('\n');
  }

  private async classifyIntent(message: string): Promise<IntentType> {
    const normalized = message.trim();
    this.logger.log(`classifyIntent start: messageLength=${normalized.length}`);
    if (!normalized) {
      this.logger.warn('classifyIntent rejected empty message');
      return 'out_of_scope';
    }

    const keywords = ['泡面', '面条', '推荐', '口味', '辣度', '预算', '方便', '健康', '吃什么'];
    const matched = keywords.some((keyword) => normalized.includes(keyword));

    if (matched) {
      this.logger.log('classifyIntent decided by keyword matching');
      return 'noodle_recommendation';
    }

    try {
      const model = this.modelProvider.getModel();
      if (!model) {
        this.logger.warn('classifyIntent could not run because model is unavailable');
        return 'out_of_scope';
      }

      const response = await model.invoke([
        ['system', '你是一个意图分类器。请判断用户问题是否与“泡面推荐”相关。只输出一个词：noodle_recommendation 或 out_of_scope。'],
        ['user', `用户输入: ${normalized}`],
      ]);

      const text = this.extractText(response.content).trim().toLowerCase();
      const intent = text.includes('noodle_recommendation') ? 'noodle_recommendation' : 'out_of_scope';
      this.logger.log(`classifyIntent finished: intent=${intent}, rawResponse=${this.truncateText(text, 200)}`);
      return intent;
    } catch (error) {
      this.logger.warn(`意图识别失败，默认拒绝: ${(error as Error).message}`);
      return 'out_of_scope';
    }
  }

  private async validateAuthorization(authorization: string): Promise<{ ok: boolean; user?: { id: string; email: string }; error?: string }> {
    this.logger.log(`validateAuthorization start: authLength=${authorization.length}`);
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      this.logger.warn('validateAuthorization failed: no bearer token found');
      return { ok: false, error: 'no_token' };
    }

    try {
      const response = await this.authGrpcClient.validateToken(token);
      if (!response.ok) {
        this.logger.warn(`validateAuthorization failed: ${response.error ?? 'unknown error'}`);
        return { ok: false, error: response.error ?? 'invalid_token' };
      }

      this.logger.log(`validateAuthorization success: user=${response.user?.email ?? response.user?.id ?? 'unknown'}`);
      return { ok: true, user: { id: response.user?.id ?? '', email: response.user?.email ?? '' } };
    } catch (error) {
      this.logger.error('validateAuthorization exception', error as Error);
      return { ok: false, error: 'grpc_error' };
    }
  }

  private async runLangGraphWorkflow(context: WorkflowContext) {
    let graph: any = new StateGraph(WorkflowStateAnnotation);
    const initialState: WorkflowState = {
      message: this.truncateText(context.message, MAX_PROMPT_TEXT_LENGTH),
      imageUrl: context.imageUrl,
      imageData: this.sanitizeImageData(context.imageData),
      preferences: '',
      searchResult: '',
      supervisorResult: '',
    };

    const stageOrder: StageName[] = ['parsePreferences', 'search', 'supervisor'];

    graph = graph.addNode('parsePreferences', async (state: WorkflowState) => {
      this.logger.log(`开始阶段：偏好解析智能体，state: ${JSON.stringify(state)}`);
      const prompt = this.buildParsePrompt(state);
      this.logger.log(`parsePreferences prompt: length=${prompt.length} preview=${this.truncateText(prompt,120)}`);
      const content = await this.runAgentNode(
        'parsePreferences',
        prompt,
        this.getFallbackForStage('parsePreferences'),
      );
      this.logger.log(`完成阶段：偏好解析智能体, resultLength=${(content || '').length} preview=${this.truncateText(content,120)}`);

      return {
        preferences: content,
      };
    });

    graph = graph.addNode('search', async (state: WorkflowState) => {
      this.logger.log(`开始阶段：搜索智能体，state: ${JSON.stringify(state)}`);
      const content = await this.runTavilySearch(state);
      this.logger.log(`完成阶段：搜索智能体，state: ${JSON.stringify(state)}`);

      return {
        searchResult: content,
      };
    });

    graph = graph.addNode('supervisor', async (state: WorkflowState) => {
      this.logger.log(`开始阶段：监督智能体，state: ${JSON.stringify(state)}`);
      const prompt = this.buildSupervisorPrompt(state);
      this.logger.log(`supervisor prompt: length=${prompt.length} preview=${this.truncateText(prompt,120)}`);
      const content = await this.runAgentNode(
        'supervisor',
        prompt,
        this.getFallbackForStage('supervisor'),
      );
      this.logger.log(`完成阶段：监督智能体, resultLength=${(content || '').length} preview=${this.truncateText(content,120)}`);

      return {
        supervisorResult: content,
      };
    });

    graph = graph.addEdge(START, 'parsePreferences');
    graph = graph.addEdge('parsePreferences', 'search');
    graph = graph.addEdge('search', 'supervisor');
    graph = graph.addEdge('supervisor', END);

    this.logger.log(`工作流执行顺序: ${stageOrder.join(' -> ')}`);

    const compiledGraph = graph.compile();
    const result = await compiledGraph.invoke(initialState);
    return {
      preferences: result.preferences || '',
      searchResult: result.searchResult || '',
      supervisorResult: result.supervisorResult || '',
    };
  }

  private async runAgentNode(stage: StageName, prompt: string, fallback: string) {
    const model = this.modelProvider.getModel();
    if (!model) {
      this.logger.warn(`模型未配置，阶段 ${stage} 使用兜底结果。`);
      return fallback;
    }

    this.logger.log(`runAgentNode start: stage=${stage} promptLength=${prompt.length}`);

    return this.runWithRetry(
      stage,
      async () => {
        const response = await model.invoke([
          ['system', this.buildStageInstruction(stage)],
          ['user', this.truncateText(prompt, MAX_PROMPT_TEXT_LENGTH)],
        ]);
        const text = this.extractText(response.content);
        this.logger.log(`runAgentNode response: stage=${stage} responseLength=${text.length} preview=${this.truncateText(text,200)}`);
        return text;
      },
      fallback,
    );
  }

  private async runTavilySearch(state: WorkflowState) {
    if (!this.tavilyProvider.isEnabled()) {
      this.logger.warn('Tavily 未配置，搜索阶段使用兜底结果。');
      return this.getFallbackForStage('search');
    }

    const query = this.buildTavilyQuery(state);
    this.logger.log(`runTavilySearch start: queryLength=${query.length}`);

    return this.runWithRetry(
      'search',
      async () => {
        const response = await this.tavilyProvider.search(query, {
          search_depth: 'basic',
          chunks_per_source: 3,
          max_results: 4,
          include_answer: false,
          include_raw_content: false,
        });

        const summary = this.buildStructuredSearchSummary(response);
        this.logger.log(`runTavilySearch success: requestId=${response.request_id ?? 'unknown'} results=${response.results?.length ?? 0}`);
        return summary;
      },
      this.getFallbackForStage('search'),
    );
  }

  private buildStructuredSearchSummary(response: TavilySearchResponse) {
    const results = (response.results ?? []).slice(0, 4).map((item) => {
      const title = this.normalizeText(item.title);
      const content = this.normalizeText(item.content);
      const summary = this.summarizeText(content, 140);

      return {
        title,
        url: item.url ?? '',
        brand: this.inferBrand(title),
        price: this.inferPrice(content, title),
        flavor: this.inferFlavor(content, title),
        summary,
        relevanceScore: typeof item.score === 'number' ? item.score : undefined,
        truncated: content.length > 220,
      };
    });

    return JSON.stringify({
      query: this.normalizeText(response.query),
      answer: this.normalizeText(response.answer),
      results,
      missing_fields: this.findMissingFields(results),
      request_id: response.request_id ?? '',
    });
  }

  private normalizeText(text?: string): string {
    if (!text) {
      return '';
    }

    return text.replace(/\s+/g, ' ').trim();
  }

  private summarizeText(text: string, maxLength = 140): string {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
  }

  private inferBrand(title: string): string {
    const normalized = title.toLowerCase();
    if (normalized.includes('统一')) return '统一';
    if (normalized.includes('康师傅')) return '康师傅';
    if (normalized.includes('白象')) return '白象';
    if (normalized.includes('今麦郎')) return '今麦郎';
    if (normalized.includes('日清')) return '日清';
    if (normalized.includes('老坛')) return '老坛';
    return '';
  }

  private inferPrice(content: string, title: string): string {
    const combined = `${title} ${content}`.toLowerCase();
    if (combined.includes('元')) {
      const match = combined.match(/(\d+(?:\.\d+)?)(?:元|块|人民币)/);
      if (match) {
        return `${match[1]}元`;
      }
    }

    if (combined.includes('价格') || combined.includes('售价')) {
      return '价格信息较少';
    }

    return '';
  }

  private inferFlavor(content: string, title: string): string {
    const combined = `${title} ${content}`.toLowerCase();
    const flavorKeywords = [
      ['辣', '辣味', '麻辣', '香辣', '红油', '微辣', '中辣', '重辣'],
      ['酸', '酸辣', '番茄', '酸甜'],
      ['香', '牛肉', '海鲜', '鸡肉', '蔬菜', '乌冬', '骨汤'],
      ['清淡', '清爽', '淡', '原味'],
    ];

    for (const group of flavorKeywords) {
      if (group.some((keyword) => combined.includes(keyword))) {
        return group[0];
      }
    }

    return '';
  }

  private findMissingFields(results: Array<{ brand: string; price: string; flavor: string; summary: string }>) {
    const missing = new Set<string>();

    if (results.length === 0) {
      return ['results'];
    }

    results.forEach((item, index) => {
      if (!item.brand) {
        missing.add(`results[${index}].brand`);
      }
      if (!item.price) {
        missing.add(`results[${index}].price`);
      }
      if (!item.flavor) {
        missing.add(`results[${index}].flavor`);
      }
      if (!item.summary) {
        missing.add(`results[${index}].summary`);
      }
    });

    return Array.from(missing);
  }

  private buildTavilyQuery(state: WorkflowState) {
    const lines = [
      '请根据以下用户偏好推荐适合的泡面。',
      `用户偏好: ${state.preferences}`,
      '请优先考虑口味、预算、辣度、方便性和健康倾向。',
      '仅返回适合中国市场、可在线购买的泡面推荐。',
    ];
    return lines.filter(Boolean).join(' ');
  }

  private buildParsePrompt(state: WorkflowState) {
    const promptState = this.buildPromptState(state);
    const lines = [
      '请从用户输入中提取结构化偏好，包括口味、预算、辣度偏好、方便程度、健康倾向、地方特色、图片风格描述。',
      `用户输入: ${promptState.message}`,
      promptState.imageUrl ? `图片链接: ${promptState.imageUrl}` : '',
      promptState.imageData ? '已上传图片，请分析其情绪和风格。' : '',
      '输出必须是 JSON，例如: {"taste":"香辣","budget":"50元以内","spicy":"中辣","convenience":"追求快捷","health":"适中"}',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private buildSearchPrompt(state: WorkflowState) {
    const promptState = this.buildPromptState(state);
    return [
      '你是搜索智能体，根据提取的偏好推荐 3-4 款泡面。',
      `用户偏好: ${promptState.preferences}`,
      '推荐结果应包含名称、口味描述、价格区间、适合人群、为何适合该偏好。输出 JSON。',
    ].join('\n');
  }

  private buildSupervisorPrompt(state: WorkflowState) {
    const promptState = this.buildPromptState(state);
    return [
      '你是监督智能体，将搜索结果整合为最终答案。',
      `用户输入: ${promptState.message}`,
      promptState.imageUrl ? `图片链接: ${promptState.imageUrl}` : '',
      promptState.imageData ? '附带已上传图片分析。' : '',
      `搜索结果: ${promptState.searchResult}`,
      '输出 JSON，包含 recommendations 和 explanation。仅在无法生成推荐时，使用 fallback_reason 说明原因。',
    ].join('\n');
  }

  private buildStageInstruction(stage: StageName) {
    switch (stage) {
      case 'parsePreferences':
        return [
          '你是偏好提取智能体。',
          '从用户输入中提取口味、预算、辣度偏好、方便程度、健康倾向和情绪。',
          '输出必须是简洁的 JSON 对象，不包含额外解释。',
        ].join('\n');
      case 'search':
        return [
          '你是搜索智能体。',
          '基于用户偏好推荐 3-4 款泡面。',
          '输出 JSON，不要包含多余文本。',
        ].join('\n');
      case 'supervisor':
        return [
          '你是监督智能体。',
          '整合搜索和链接结果，给出最终可直接展示给用户的回答。',
          '输出 JSON。',
        ].join('\n');
      default:
        return this.buildSystemPrompt();
    }
  }

  private getFallbackForStage(stage: StageName) {
    switch (stage) {
      case 'parsePreferences':
        return JSON.stringify({ taste: '普遍口味', budget: '中等', spicy: '微辣', convenience: '方便', health: '适中' });
      case 'search':
        return JSON.stringify({
          query: '默认泡面推荐',
          answer: '使用默认推荐列表',
          results: [
            {
              title: '统一小当家麻辣牛肉面',
              url: '',
              brand: '统一',
              price: '10-15元',
              flavor: '微辣',
              summary: '性价比高，适合喜欢微辣口味的用户。',
              relevanceScore: 0.9,
              truncated: false,
            },
            {
              title: '康师傅红烧牛肉面',
              url: '',
              brand: '康师傅',
              price: '8-12元',
              flavor: '香浓',
              summary: '经典口碑，适合大众口味。',
              relevanceScore: 0.8,
              truncated: false,
            },
          ],
          missing_fields: [],
          request_id: 'fallback',
        });
      case 'supervisor':
        return JSON.stringify({});
      default:
        return '无法获取推荐。';
    }
  }

  private async runWithRetry<T>(stage: StageName, operation: () => Promise<T>, fallback: T): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`Stage ${stage} attempt ${attempt} started`);
        const result = await operation();
        this.logger.log(`Stage ${stage} attempt ${attempt} succeeded`);
        return result;
      } catch (error) {
        this.logger.warn(`Stage ${stage} attempt ${attempt}/${MAX_RETRIES} failed: ${(error as Error).message}`);

        if (attempt === MAX_RETRIES) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
      }
    }

    this.logger.warn(`Stage ${stage} failed after ${MAX_RETRIES} attempts, using fallback`);
    return fallback;
  }

  private truncateText(text: string | undefined, maxLength = MAX_PROMPT_TEXT_LENGTH): string {
    if (!text) {
      return '';
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength)}\n...[truncated]`;
  }

  private sanitizeImageData(imageData?: string): string | undefined {
    if (!imageData) {
      return undefined;
    }

    if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
      return `[image-data-truncated:${imageData.length} chars]`;
    }

    return imageData;
  }

  private buildPromptState(state: WorkflowState) {
    return {
      message: this.truncateText(state.message, MAX_PROMPT_TEXT_LENGTH),
      preferences: this.truncateText(state.preferences, MAX_PROMPT_TEXT_LENGTH),
      searchResult: this.truncateText(state.searchResult, MAX_SEARCH_RESULT_LENGTH),
      imageUrl: state.imageUrl,
      imageData: this.sanitizeImageData(state.imageData),
    };
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .join('\n');
    }
    if (typeof content === 'object' && content !== null) {
      return JSON.stringify(content);
    }
    return String(content ?? '');
  }

  private buildFallbackResponse(payload: RecommendPayload) {
    return {
      type: 'fallback',
      data: {
        message: '推荐失败，模型当前不可用，请稍后重试。',
        fallback_reason: '模型不可用或请求失败。',
      },
    };
  }

  private parseRecommendation(text: string) {
    try {
      const firstJson = text.match(/\{[\s\S]*\}/);
      if (!firstJson) {
        throw new Error('No JSON found');
      }
      return JSON.parse(firstJson[0]);
    } catch {
      return {
        message: '解析失败，无法生成推荐。',
        fallback_reason: '无法解析模型输出。',
      };
    }
  }
}
