import {
  AgentType,
  IntentClassification,
  LlmStage,
  RelationPlan,
} from "./types";

export type WorkflowActor = "orchestrator" | AgentType;

/**
 * 一轮工作流的内部时间线。写入 turn_events.body。
 * 新增 kind 时只扩展这个联合，不要再加 stage 字符串。
 */
export type TurnEventBody =
  | {
      kind: "intent";
      actor: "orchestrator";
      intent: IntentClassification;
    }
  | {
      kind: "plan";
      actor: "orchestrator";
      agents: AgentType[];
      relation?: RelationPlan;
    }
  | {
      kind: "tool_call";
      actor: AgentType;
      tool_name: string;
      input: Record<string, unknown>;
      output: unknown;
    }
  | {
      kind: "agent_result";
      actor: AgentType;
      success: boolean;
      result: unknown;
    }
  | {
      kind: "error";
      actor: WorkflowActor;
      message: string;
    }
  | LlmUsageTurnEvent;

/**
 * 一次 LLM 调用的用量。message-service 只存不解析。
 */
export interface LlmUsageTurnEvent {
  kind: "llm_usage";
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
