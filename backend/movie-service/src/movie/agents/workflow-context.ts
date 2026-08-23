import {
  AgentExecutionResult,
  AgentType,
  ConversationHistoryItem,
  IntentClassification,
  RelationPlan,
  ResolvedEntity,
  SearchAgentResult,
  AGENT_TYPE,
} from "../types";
import { WorkingSet } from "../working-set";
import { noopTurnEventSink, TurnEventBody, TurnEventSink } from "../turn-events";

export interface AgentPublicOutput {
  success: boolean;
  result: string;
}

/**
 * 所有 Agent 都能读的状态。
 * 写入约定：Orchestrator 写 intent / plan / relationPlan / finalResult；
 * 各 Agent 只通过 runtime.publish() 写自己的公开结果。
 * 完整检索数据进 workspace，不进 agentOutputs。
 */
export interface SharedWorkflowState {
  readonly query: string;
  /** 已完成轮次的可见问答，按时间序。 */
  readonly turns: ConversationHistoryItem[];
  intent?: IntentClassification;
  plan: AgentType[];
  relationPlan?: RelationPlan;
  readonly agentOutputs: Partial<Record<AgentType, AgentPublicOutput>>;
  finalResult?: string;
}

export interface SearchPrivateState {
  toolCalls: SearchAgentResult["tool_calls"];
  reasoning?: string;
  error?: string;
}

export interface RelationPrivateState {
  resolved: ResolvedEntity[];
  error?: string;
}

export type AgentLocalMap = {
  [AGENT_TYPE.SEARCH]: SearchPrivateState;
  [AGENT_TYPE.RELATION]: RelationPrivateState;
};

/**
 * Agent 运行时视图：能读全部 shared，但 local 只有自己那一份。
 * workspace 是本轮共享工作副本，请求结束即释放。
 */
export interface AgentRuntime<TLocal> {
  readonly shared: SharedWorkflowState;
  readonly local: TLocal;
  readonly workspace: WorkingSet;
  publish(output: AgentPublicOutput): void;
  record(body: TurnEventBody): Promise<void>;
}

/**
 * 单次推荐请求的工作流上下文，不要做成 Nest 单例。
 */
export class WorkflowContext {
  readonly shared: SharedWorkflowState;
  readonly workspace: WorkingSet;
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
    this.workspace = new WorkingSet();
    this.locals = {
      [AGENT_TYPE.SEARCH]: { toolCalls: [] },
      [AGENT_TYPE.RELATION]: { resolved: [] },
    };
    this.events = init.events ?? noopTurnEventSink;
  }

  forAgent<K extends AgentType>(agent: K): AgentRuntime<AgentLocalMap[K]> {
    return {
      shared: this.shared,
      local: this.locals[agent],
      workspace: this.workspace,
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
