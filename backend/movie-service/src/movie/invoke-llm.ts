import {
  AGENT_TYPE,
  ChatMessage,
  CompatibleModel,
  LlmStage,
} from "./types";
import { AbortContext } from "./abort-context";
import { TurnEventBody, WorkflowActor } from "./turn-events";

/**
 * 调模型并写入 `llm_usage` 事件。重试时每次尝试各记一条。
 * @param model 工作流模型
 * @param messages 发给模型的消息
 * @param options.stage 阶段
 * @param options.actor orchestrator 或 search
 * @param options.record 写入 turn_events；缺省则只调模型
 * @returns 模型正文
 */
export async function invokeLlm(
  model: CompatibleModel,
  messages: ChatMessage[],
  options: {
    stage: LlmStage;
    actor: WorkflowActor;
    record?: (body: TurnEventBody) => Promise<void>;
  },
): Promise<unknown> {
  AbortContext.throwIfAborted();
  const started = Date.now();
  try {
    const response = await model.invoke(messages, { stage: options.stage });
    await recordUsage(options, response.usage);
    return response.content;
  } catch (error) {
    await recordUsage(options, {
      durationMs: Date.now() - started,
      ok: false,
    });
    throw error;
  }
}

async function recordUsage(
  options: {
    stage: LlmStage;
    actor: WorkflowActor;
    record?: (body: TurnEventBody) => Promise<void>;
  },
  usage: {
    durationMs: number;
    ok: boolean;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
  },
): Promise<void> {
  if (!options.record) return;
  await options.record({
    kind: "llm_usage",
    actor: options.actor,
    stage: options.stage,
    durationMs: usage.durationMs,
    ok: usage.ok,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    model: usage.model,
  });
}

/** 编排层 LLM 调用的 actor。 */
export const ORCHESTRATOR_ACTOR: WorkflowActor = "orchestrator";

/** Search 选工具那一次的 actor。 */
export const SEARCH_ACTOR: WorkflowActor = AGENT_TYPE.SEARCH;
