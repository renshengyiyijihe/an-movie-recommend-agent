import { TURN_EVENT_KIND } from "@an-movie/contracts";
import {
  AgentType,
  IntentClassification,
  LlmStage,
  RelationPlan,
} from "./types";

export type WorkflowActor = "orchestrator" | AgentType;

/**
 * 一轮工作流的内部时间线。写入 turn_events.body。
 * 新增 kind 时先加 {@link TURN_EVENT_KIND}，再扩展这个联合。
 */
export type TurnEventBody =
  | {
      kind: typeof TURN_EVENT_KIND.INTENT;
      actor: "orchestrator";
      intent: IntentClassification;
    }
  | {
      kind: typeof TURN_EVENT_KIND.PLAN;
      actor: "orchestrator";
      agents: AgentType[];
      relation?: RelationPlan;
    }
  | {
      kind: typeof TURN_EVENT_KIND.TOOL_CALL;
      actor: AgentType;
      tool_name: string;
      input: Record<string, unknown>;
      output: unknown;
    }
  | {
      kind: typeof TURN_EVENT_KIND.AGENT_RESULT;
      actor: AgentType;
      success: boolean;
      result: unknown;
    }
  | {
      kind: typeof TURN_EVENT_KIND.ERROR;
      actor: WorkflowActor;
      message: string;
    }
  | MemoryRecallTurnEvent
  | LlmUsageTurnEvent;

/**
 * 本轮跨会话记忆的召回情况。只为排查"记忆有没有起作用"，不推给浏览器。
 */
export interface MemoryRecallTurnEvent {
  kind: typeof TURN_EVENT_KIND.MEMORY;
  actor: "orchestrator";
  /** 进入汇总 prompt 的记忆条数，0 表示本轮没有可用记忆 */
  recalled: number;
  /** 最高相似度，无命中时为 0 */
  topScore: number;
}

/**
 * 一次 LLM 调用的用量。message-service 只存不解析。
 */
export interface LlmUsageTurnEvent {
  kind: typeof TURN_EVENT_KIND.LLM_USAGE;
  /** orchestrator 或发起这次调用的 Agent */
  actor: WorkflowActor;
  /** 意图 / 规划 / 选工具 / 汇总 */
  stage: LlmStage;
  /** 调用耗时，毫秒 */
  durationMs: number;
  /** 模型是否成功返回 */
  ok: boolean;
  /** 输入 token */
  promptTokens?: number;
  /** 输出 token */
  completionTokens?: number;
  /** 合计 token */
  totalTokens?: number;
  /** 实际模型名 */
  model?: string;
}

/**
 * 工作流写 turn_events 的出口。movie.service 接到 gRPC，无 turnId 时用 noop。
 */
export interface TurnEventSink {
  record(body: TurnEventBody): Promise<void>;
}

/**
 * StartTurn 失败、没有 turnId 时用，工作流照跑，不写库。
 */
export const noopTurnEventSink: TurnEventSink = {
  async record() {},
};
