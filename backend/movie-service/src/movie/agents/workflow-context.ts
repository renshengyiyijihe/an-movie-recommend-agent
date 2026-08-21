import {
  AgentExecutionResult,
  AgentType,
  ConversationHistoryItem,
  IntentClassification,
  RelationshipType,
  SearchAgentResult,
} from "../types";
import { noopTurnEventSink, TurnEventBody, TurnEventSink } from "../turn-events";

export interface AgentPublicOutput {
  success: boolean;
  result: string;
}

/**
 * 所有 Agent 都能读的状态。
 * 写入约定：Orchestrator 写 intent / plan / finalResult；
 * 各 Agent 只通过 runtime.publish() 写自己的公开结果。
 */
export interface SharedWorkflowState {
  readonly query: string;
  /** 已完成轮次的可见问答，按时间序。 */
  readonly turns: ConversationHistoryItem[];
  intent?: IntentClassification;
  plan: AgentType[];
  readonly agentOutputs: Partial<Record<AgentType, AgentPublicOutput>>;
  finalResult?: string;
}

export interface SearchPrivateState {
  toolCalls: SearchAgentResult["tool_calls"];
  reasoning?: string;
  error?: string;
}

export interface RelationPrivateState {
  entities: string[];
  relationship: RelationshipType;
  gatheredData?: string;
  error?: string;
}

export type AgentLocalMap = {
  search: SearchPrivateState;
  relation: RelationPrivateState;
};

/**
 * Agent 运行时视图：能读全部 shared，但 local 只有自己那一份。
 * 类型上拿不到其他 Agent 的私有袋。
 */
export interface AgentRuntime<TLocal> {
  readonly shared: SharedWorkflowState;
  readonly local: TLocal;
  publish(output: AgentPublicOutput): void;
  record(body: TurnEventBody): Promise<void>;
}

/**
 * 单次推荐请求的工作流上下文，不要做成 Nest 单例。
 */
export class WorkflowContext {
  readonly shared: SharedWorkflowState;
  private readonly locals: AgentLocalMap;
  private readonly events: TurnEventSink;

  constructor(init: {
    query: string;
    turns?: ConversationHistoryItem[];
    events?: TurnEventSink;
  }) {
    this.shared = {
      query: init.query,
      turns: init.turns ?? [],
      plan: [],
      agentOutputs: {},
    };
    this.locals = {
      search: { toolCalls: [] },
      relation: {
        entities: [],
        relationship: "unknown",
      },
    };
    this.events = init.events ?? noopTurnEventSink;
  }

  forAgent<K extends AgentType>(agent: K): AgentRuntime<AgentLocalMap[K]> {
    return {
      shared: this.shared,
      local: this.locals[agent],
      publish: (output) => this.publish(agent, output),
      record: (body) => this.record(body),
    };
  }

  publish(agent: AgentType, output: AgentPublicOutput): void {
    this.shared.agentOutputs[agent] = output;
  }

  record(body: TurnEventBody): Promise<void> {
    return this.events.record(body);
  }

  getPublicResults(): AgentExecutionResult[] {
    return this.shared.plan.map((agent) => {
      const output = this.shared.agentOutputs[agent];
      return {
        agent,
        success: output?.success ?? false,
        result: output?.result ?? "",
      };
    });
  }
}
