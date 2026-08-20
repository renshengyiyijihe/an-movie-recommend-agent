import { Injectable, Logger } from "@nestjs/common";
import {
  HistoryProjectionKind,
  projectConversationHistory,
} from "../conversation-history";
import { ConversationHistoryItem } from "../types";

/**
 * Prompt模板服务
 * 统一管理所有LLM prompt，采用Markdown格式便于维护
 */
@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);

  /**
   * 将 Agent/Tool 检索结果整理成最终回答 JSON
   */
  getResultSynthesisPrompt(
    userMessage: string,
    agentEvidence: string,
    turns?: ConversationHistoryItem[],
  ): { system: string; user: string } {
    return {
      system: `# 电影领域回答汇总

你是电影领域助手，负责根据用户问题和已执行的检索结果作答。能力包括电影/演员查询、作品介绍、条件筛选和推荐，不限于推荐片单。

## 规则
1. 先判断用户要什么：查一部具体电影、查演员/导演、按条件筛选，还是要推荐。回答形态必须跟问题匹配，不要把所有请求都做成推荐片单。
2. 影片数量由用户决定。用户说要 N 部就尽量给 N 部；说“一部/几部/一批”就按语义理解；没说数量且确实是在要片单时，从检索结果里选最相关的即可，不要为凑数而补片。
3. 事实问答（上映时间、主演、简介等）以 \`explanation\` 为主；只有需要展示具体影片卡片时才往 \`recommendations\` 里放对应电影。
4. \`recommendations\` 里的电影必须来自检索结果，不要编造不存在的影片、ID 或海报。检索结果不够用时，有多少用多少，不要用无关影片凑数。
5. 电影 ID 可能出现在 \`id\` 或 \`movie_id\` 字段，输出时统一写入 \`id\`。
6. \`reason\` 说明这部片为什么出现在本次回答里；\`explanation\` 直接回应用户问题，不要写成固定的“推荐说明”。
7. 检索结果无法回答时，\`recommendations\` 返回空数组，并用 \`fallback_reason\` 说明原因。
8. 只能输出纯 JSON，不要 Markdown、代码围栏或解释文字。

## 输出格式
{
  "recommendations": [
    {
      "name": "电影名",
      "reason": "与用户问题相关的原因",
      "summary": "简短介绍",
      "poster_url": "https://image.tmdb.org/t/p/w500/xxx.jpg",
      "tmdb_url": "https://www.themoviedb.org/movie/27205",
      "id": 27205
    }
  ],
  "explanation": "针对用户问题的回答"
}
`,
      user: `## 用户问题
${userMessage}

${this.renderHistorySection(turns, "synthesis")}## 检索结果
${agentEvidence}
`,
    };
  }

  /**
   * 意图识别prompt
   */
  getIntentClassificationPrompt(
    userMessage: string,
    turns?: ConversationHistoryItem[],
  ): { system: string; user: string } {
    return {
      system: `# 意图识别

## 任务
判断用户查询是否与电影、演员相关。

## 输出要求
返回一个 JSON 对象，包含：
- \`type\` (string) - "in_scope" 或 "out_of_scope"
- \`confidence\` (number) - 置信度 0-1
- \`reason\` (string，可选) - 不在范围内的原因

## 范围内的查询类型

✅ 电影推荐和搜索
✅ 电影基本信息（上映年份、评分等）
✅ 演员/导演信息
✅ 电影类型和风格讨论
✅ 观影建议

## 范围外的查询类型

❌ 与电影无关的通用问题
❌ 其他领域的专业咨询
❌ 非电影内容的讨论

## 输出示例

在范围内：
\`\`\`json
{
  "type": "in_scope",
  "confidence": 0.95
}
\`\`\`

不在范围内：
\`\`\`json
{
  "type": "out_of_scope",
  "confidence": 0.9,
  "reason": "这个查询与电影和演员无关"
}
\`\`\`
`,
      user: `## 用户消息
\`\`\`
${userMessage}
\`\`\`

${this.renderHistorySection(turns, "intent", true)}`,
    };
  }

  /**
   * 任务规划prompt
   */
  getTaskPlanningPrompt(
    userMessage: string,
    intentType: string,
    turns?: ConversationHistoryItem[],
  ): { system: string; user: string } {
    return {
      system: `# 电影任务规划

## 任务
根据用户意图，为当前请求选择需要执行的Agent。

## 可用Agent
- search: 电影、演员、导演信息查询和普通电影推荐
- relation: 演员合作、导演作品关系、跨实体关系分析

## 输出要求
只返回纯JSON，不要包含Markdown或解释文字。格式必须为：
{
  "agents": ["search"]
}

只能返回 search、relation。普通查询选择 search，涉及合作、共同作品或实体关系时选择 relation。

`,
      user: `## 用户意图
${intentType}

## 用户消息
${userMessage}

${this.renderHistorySection(turns, "planning")}
`,
    };
  }

  /**
   * 搜索工具规划prompt
   */
  getSearchToolPlanningPrompt(
    userMessage: string,
    toolSchemas: Array<{ name: string; description: string; schema: Record<string, any> }>,
    turns?: ConversationHistoryItem[],
  ): { system: string; user: string } {
    return {
      system: `# 电影搜索工具规划

## 任务
根据用户查询选择一个或多个最合适的工具，并为每个工具生成严格符合其 schema 的参数。

## 可用工具
${JSON.stringify(toolSchemas, null, 2)}

## 规则
1. 只选择能够直接帮助回答用户查询的工具，不要臆造工具或参数。
2. 工具名称必须来自可用工具列表。
3. 每个调用的 input 必须是 JSON 对象，并且字段类型必须符合对应 schema。
4. 需要多个独立查询时可以返回多个调用；没有必要时只返回一个调用。
5. 至少返回一个工具调用。
6. 只能输出纯 JSON，不要输出 Markdown、代码围栏或额外解释。

## 输出格式
{
  "tool_calls": [
    {
      "tool_name": "工具名称",
      "input": {}
    }
  ],
  "reasoning": "选择这些工具的简短原因"
}
`,
      user: `## 用户查询
${userMessage}

${this.renderHistorySection(turns, "search")}
`,
    };
  }

  private renderHistorySection(
    turns: ConversationHistoryItem[] | undefined,
    kind: HistoryProjectionKind,
    fenced = false,
  ): string {
    const history = projectConversationHistory(turns, kind);
    if (!history) return "";
    return fenced
      ? `## 对话历史\n\`\`\`\n${history}\n\`\`\`\n`
      : `## 对话历史\n${history}\n`;
  }
}
