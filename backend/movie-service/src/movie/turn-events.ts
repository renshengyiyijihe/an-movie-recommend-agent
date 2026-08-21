import { AgentType, IntentClassification } from "./types";

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
    }
  | {
      kind: "tool_call";
      actor: "search";
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
    };

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
