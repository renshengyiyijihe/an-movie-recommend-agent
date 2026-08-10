import { Logger } from "@nestjs/common";

export type StageName = "parsePreferences" | "search" | "supervisor";

export interface StagePlannerResult {
  plan: StageName[];
  rawPlan: string;
}

interface PlannerModel {
  invoke(messages: Array<[string, string]>): Promise<{ content: unknown }>;
}

interface WorkflowPlannerContext {
  message: string;
  conversationHistory?: string;
}

const MAX_ALLOWED_WORKFLOW_STAGES = 3;
const MAX_PLANNER_ATTEMPTS = 3;
const WORKFLOW_STAGE_SEQUENCE: StageName[] = [
  "parsePreferences",
  "search",
  "supervisor",
];

export class WorkflowPlanner {
  constructor(private readonly logger: Logger) {}

  async plan(
    context: WorkflowPlannerContext,
    model: PlannerModel | null,
  ): Promise<StagePlannerResult> {
    if (!model) {
      this.throwPlannerError("阶段规划失败：模型未配置");
    }

    for (let attempt = 1; attempt <= MAX_PLANNER_ATTEMPTS; attempt += 1) {
      try {
        const plannerPrompt = this.buildPlannerPrompt(context);
        this.logger.log(`[planner] attempt=${attempt} prompt=\n${plannerPrompt}`);

        const response = await model.invoke([
          ["system", this.buildPlannerInstruction()],
          ["user", plannerPrompt],
        ]);
        const rawPlan = this.extractText(response.content).trim();
        const plan = this.parseAndValidateStagePlan(rawPlan);
        this.logger.log(
          `[planner] attempt=${attempt} succeeded raw=${rawPlan} plan=${plan.join(" -> ")}`,
        );
        return { plan, rawPlan };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`[planner] attempt=${attempt}/${MAX_PLANNER_ATTEMPTS} failed: ${message}`, error);
        if (attempt === MAX_PLANNER_ATTEMPTS) {
          this.throwPlannerError(`阶段规划失败: ${message}`);
        }
      }
    }

    this.throwPlannerError("阶段规划失败：达到最大尝试次数");
  }

  private buildPlannerPrompt(context: WorkflowPlannerContext): string {
    const stageDescriptions = [
      {
        name: "parsePreferences",
        description: "从当前用户提问和历史上下文提取结构化偏好，适合需要理解用户偏好时使用。",
      },
      {
        name: "search",
        description: "基于已知偏好或当前上下文进行电影检索，适合需要找电影时使用。",
      },
      {
        name: "supervisor",
        description: "整合前面结果并生成最终可展示给用户的推荐答案，适合收尾输出时使用。",
      },
    ];

    return [
      "你是阶段规划智能体。",
      "根据当前用户提问、历史消息上下文和可用智能体能力，决定下一次推荐流程应执行哪些阶段。",
      "可用阶段如下：",
      ...stageDescriptions.map(
        (stage) => `- ${stage.name}: ${stage.description}`,
      ),
      "返回格式必须是一个阶段串，例如：parsePreferences-search-supervisor",
      "完整示例：如果用户说“推荐用户最喜欢的几部电影”，应该返回 parsePreferences-search-supervisor",
      "请不要输出额外解释，只输出阶段串。",
      "历史消息上下文：",
      context.conversationHistory || "无",
      "当前用户提问：",
      context.message,
    ].join("\n");
  }

  private buildPlannerInstruction(): string {
    return [
      "你是阶段规划智能体。",
      "根据用户当前提问和历史上下文，选择合适的执行顺序。",
      "只输出一个阶段串，阶段名只能是 parsePreferences、search、supervisor，阶段之间用 '-' 连接。",
      "不要输出多余文本，不要重复同一个阶段，不要出现非法阶段名。",
      "允许跳过某些阶段，但不能乱序。",
    ].join("\n");
  }

  private parseAndValidateStagePlan(rawPlan: string): StageName[] {
    const normalized = rawPlan.replace(/`/g, "").trim();
    if (!normalized) {
      this.throwPlannerError(`阶段规划返回为空: ${rawPlan}`);
    }

    const tokens = normalized
      .split(/[-,|\s]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      this.throwPlannerError(`阶段规划返回为空或无效: ${rawPlan}`);
    }

    const plan: StageName[] = [];
    for (const token of tokens) {
      const stage = this.normalizeStageName(token);
      if (plan.includes(stage)) {
        this.throwPlannerError(`阶段规划出现重复阶段: ${rawPlan}`);
      }
      plan.push(stage);
    }

    if (plan.length > MAX_ALLOWED_WORKFLOW_STAGES) {
      this.throwPlannerError(
        `阶段规划超过最大阶段数 ${MAX_ALLOWED_WORKFLOW_STAGES}: ${rawPlan}`,
      );
    }

    if (!this.isValidStageOrder(plan)) {
      this.throwPlannerError(`阶段规划顺序非法: ${rawPlan}`);
    }

    return plan;
  }

  private normalizeStageName(token: string): StageName {
    const normalized = token.trim().toLowerCase();
    if (normalized === "parsepreferences") {
      return "parsePreferences";
    }
    if (normalized === "search") {
      return "search";
    }
    if (normalized === "supervisor") {
      return "supervisor";
    }
    this.throwPlannerError(`阶段规划包含非法阶段名: ${token}`);
  }

  private isValidStageOrder(plan: StageName[]): boolean {
    let lastIndex = -1;
    for (const stage of plan) {
      const stageIndex = WORKFLOW_STAGE_SEQUENCE.indexOf(stage);
      if (stageIndex < 0) {
        return false;
      }
      if (stageIndex < lastIndex) {
        return false;
      }
      lastIndex = stageIndex;
    }
    return true;
  }

  private extractText(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join("\n");
    }
    if (content && typeof content === "object") {
      return JSON.stringify(content);
    }
    return String(content ?? "");
  }

  private throwPlannerError(message: string): never {
    this.logger.error(`[planner] ${message}`);
    throw new Error(message);
  }
}
