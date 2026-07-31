import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ModelProvider } from '../model/model.provider';
import { LangSmithProvider } from '../model/langsmith.provider';
import { TavilyProvider } from '../model/tavily.provider';

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
  ) {}

  async recommend(payload: RecommendPayload) {
    const model = this.modelProvider.getModel();
    const fallback = this.buildFallbackResponse(payload);

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
      const result = await this.runLangGraphWorkflow(context);

      const langsmithEnabled = !!this.langsmithProvider.getClient();
      if (langsmithEnabled) {
        await this.langsmithProvider.createRun(
          '泡面推荐请求',
          {
            user_message: payload.message,
            has_image: !!payload.imageData,
            image_url: payload.imageUrl ?? undefined,
          },
          {
            supervisor_output: result.supervisorResult,
            stage_outputs: {
              preferences: result.preferences,
              searchResult: result.searchResult,
            },
          },
          {
            stage: 'workflow',
            langchain_workflow: 'noodle_recommendation',
          },
        );
      }

      return {
        type: 'success',
        data: this.parseRecommendation(result.supervisorResult),
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
      '输出格式必须为 JSON，包含 fields: recommendations, explanation, fallback_reason。',
    ].join('\n');
  }

  private async runLangGraphWorkflow(context: WorkflowContext) {
    let graph: any = new StateGraph(WorkflowStateAnnotation);
    const initialState: WorkflowState = {
      message: context.message,
      imageUrl: context.imageUrl,
      imageData: context.imageData,
      preferences: '',
      searchResult: '',
      supervisorResult: '',
    };

    const stageOrder: StageName[] = ['parsePreferences', 'search', 'supervisor'];

    graph = graph.addNode('parsePreferences', async (state: WorkflowState) => {
      this.logger.log('开始阶段：偏好解析智能体');
      const content = await this.runAgentNode(
        'parsePreferences',
        this.buildParsePrompt(state),
        this.getFallbackForStage('parsePreferences'),
      );
      this.logger.log('完成阶段：偏好解析智能体');

      return {
        preferences: content,
      };
    });

    graph = graph.addNode('search', async (state: WorkflowState) => {
      this.logger.log('开始阶段：搜索智能体');
      const content = await this.runTavilySearch(state);
      this.logger.log('完成阶段：搜索智能体');

      return {
        searchResult: content,
      };
    });

    graph = graph.addNode('supervisor', async (state: WorkflowState) => {
      this.logger.log('开始阶段：监督智能体');
      const content = await this.runAgentNode(
        'supervisor',
        this.buildSupervisorPrompt(state),
        this.getFallbackForStage('supervisor'),
      );
      this.logger.log('完成阶段：监督智能体');

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

    try {
      const response = await model.invoke([
        ['system', this.buildStageInstruction(stage)],
        ['human', prompt],
      ]);
      return this.extractText(response.content);
    } catch (error) {
      this.logger.warn(`Stage ${stage} failed, fallback applied: ${(error as Error).message}`);
      return fallback;
    }
  }

  private async runTavilySearch(state: WorkflowState) {
    if (!this.tavilyProvider.isEnabled()) {
      this.logger.warn('Tavily 未配置，搜索阶段使用兜底结果。');
      return this.getFallbackForStage('search');
    }

    const query = this.buildTavilyQuery(state);

    try {
      const response = await this.tavilyProvider.search(query, {
        search_depth: 'basic',
        chunks_per_source: 3,
        max_results: 4,
        include_answer: false,
        include_raw_content: false,
      });

      return JSON.stringify({
        query: response.query,
        answer: response.answer ?? '',
        results: response.results.map((item) => ({
          title: item.title,
          url: item.url,
          content: item.content ?? '',
          score: item.score ?? 0,
        })),
        request_id: response.request_id ?? '',
      });
    } catch (error) {
      this.logger.warn(`Tavily 搜索失败，使用兜底结果: ${(error as Error).message}`);
      return this.getFallbackForStage('search');
    }
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
    const lines = [
      '请从用户输入中提取结构化偏好，包括口味、预算、辣度偏好、方便程度、健康倾向、地方特色、图片风格描述。',
      `用户输入: ${state.message}`,
      state.imageUrl ? `图片链接: ${state.imageUrl}` : '',
      state.imageData ? '已上传图片，请分析其情绪和风格。' : '',
      '输出必须是 JSON，例如: {"taste":"香辣","budget":"50元以内","spicy":"中辣","convenience":"追求快捷","health":"适中"}',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private buildSearchPrompt(state: WorkflowState) {
    return [
      '你是搜索智能体，根据提取的偏好推荐 3-4 款泡面。',
      `用户偏好: ${state.preferences}`,
      '推荐结果应包含名称、口味描述、价格区间、适合人群、为何适合该偏好。输出 JSON。',
    ].join('\n');
  }

  private buildSupervisorPrompt(state: WorkflowState) {
    return [
      '你是监督智能体，将搜索结果整合为最终答案。',
      `用户输入: ${state.message}`,
      state.imageUrl ? `图片链接: ${state.imageUrl}` : '',
      state.imageData ? '附带已上传图片分析。' : '',
      `搜索结果: ${state.searchResult}`,
      '输出 JSON，包含 recommendations、explanation、fallback_reason。',
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
        return JSON.stringify([
          {
            name: '统一小当家麻辣牛肉面',
            reason: '性价比高，适合喜欢微辣口味的用户。',
          },
          {
            name: '康师傅红烧牛肉面',
            reason: '经典口碑，适合大众口味。',
          },
        ]);
      case 'supervisor':
        return JSON.stringify({
          recommendations: [
            {
              name: '统一小当家麻辣牛肉面',
              reason: '常见高性价比选择，适合广泛口味。',
            },
          ],
          explanation: '当前模型不可用，使用默认推荐。',
          fallback_reason: '模型未配置或调用失败。',
        });
      default:
        return '无法获取推荐。';
    }
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
        recommendations: [
          {
            name: '统一小当家麻辣牛肉面',
            reason: '性价比高，适合喜欢微辣口味，易于购买。',
          },
          {
            name: '康师傅经典红烧牛肉面',
            reason: '经典口碑，适合大众口味和日常囤货。',
          },
        ],
        explanation: '因为缺少模型或请求失败，提供通用高口碑泡面推荐。',
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
        recommendations: [
          {
            name: '统一小当家麻辣牛肉面',
            reason: '常见高性价比选择，适合广泛口味。',
          },
        ],
        explanation: '解析失败，返回默认推荐。',
        fallback_reason: '无法解析模型输出。',
      };
    }
  }
}
