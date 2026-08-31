import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { status as GrpcStatus } from "@grpc/grpc-js";
import {
  CANCEL_REASON,
  STREAM_EVENT,
  TURN_STATUS,
  isFinishedTurnStatus,
  type CancelReason,
  type CancelledPayload,
  type ChatStreamEvent,
  type ChatStreamFinalEvent,
  type ChatTurnResult,
  type FinishedTurnStatus,
} from "@an-movie/contracts";
import { ModelProvider } from "../model/model.provider";
import { MessageGrpcClient } from "./message.grpc";
import { OrchestratorAgent } from "./agents/orchestrator.agent";
import { WorkflowContext } from "./agents/workflow-context";
import { toConversationTurns } from "./conversation-history";
import { toConversationMemories } from "./memory";
import { getStringValue, tryParseJson } from "./helpers";
import { MEMORY_CONSTANTS, MESSAGE_CONSTANTS } from "./constants";
import {
  AssistantPayload,
  ErrorPayload,
  RecommendationPayload,
  RejectPayload,
  recommendationFromParsed,
} from "./transcript";
import { noopTurnEventSink, TurnEventSink } from "./turn-events";
import { toStreamStageEvent } from "./chat-stream";
import { AbortContext } from "./abort-context";
import { isAbortError } from "./errors/workflow-cancelled.error";
import { TurnAbortRegistry } from "./turn-abort.registry";
import {
  ConversationHistoryItem,
  ConversationMemory,
  INTENT_TYPE,
  OrchestratorResult,
} from "./types";

interface ChatPayload {
  message: string;
  imageUrl?: string;
  imageData?: string;
  conversationId?: string;
}

/**
 * 工作流结论。CompleteTurn 的 `status` 与 SSE `final.type` 共用 {@link FinishedTurnStatus}。
 * 必须先写入再返回；写入失败不得冒充 success / reject。
 * `memory` 是写给以后对话的长期记忆，只随 CompleteTurn 落向量库，
 * 不进可见气泡、不进 SSE，只有成功轮次才可能有。
 */
type ChatOutcome = { memory?: string } & (
  | { status: typeof TURN_STATUS.SUCCESS; payload: RecommendationPayload }
  | { status: typeof TURN_STATUS.REJECT; payload: RejectPayload }
  | { status: typeof TURN_STATUS.ERROR; payload: ErrorPayload }
  | { status: typeof TURN_STATUS.CANCELLED; payload: CancelledPayload }
);

@Injectable()
export class MovieService {
  private readonly logger = new Logger(MovieService.name);

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly messageGrpcClient: MessageGrpcClient,
    private readonly orchestratorAgent: OrchestratorAgent,
    private readonly abortRegistry: TurnAbortRegistry,
  ) {}

  async chat(
    payload: ChatPayload,
    emit: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    const ac = new AbortController();
    return AbortContext.run(ac.signal, () => this.runChat(payload, emit, ac));
  }

  /**
   * 停止按钮或前端超时。断线不要走这里。
   * 先 abort 本机工作流，再 CAS CompleteTurn；和正在跑的 chat() 谁先写入由行锁决定。
   */
  async cancelTurn(
    turnId: string,
    reason: CancelReason = CANCEL_REASON.USER,
  ): Promise<void> {
    const outcome =
      reason === CANCEL_REASON.TIMEOUT
        ? this.timeoutOutcome()
        : this.cancelledOutcome();
    try {
      // 先 CAS 收口，再 abort：避免 chat() 在 abort 后抢先写成 cancelled，把 timeout 的 error 盖掉。
      await this.completeTurn(turnId, outcome.status, outcome.payload);
    } catch (error) {
      if (grpcCode(error) === GrpcStatus.NOT_FOUND) {
        throw new NotFoundException(`Turn not found: ${turnId}`);
      }
      throw error;
    } finally {
      this.abortRegistry.abort(turnId);
    }
  }

  private async runChat(
    payload: ChatPayload,
    emit: (event: ChatStreamEvent) => void,
    ac: AbortController,
  ): Promise<void> {
    this.logger.log(
      `chat request received: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}`,
    );

    let conversationId: string | undefined;
    let turnId: string | undefined;
    try {
      conversationId = await this.ensureConversation(payload);
      const [turns, memories] = await Promise.all([
        this.loadConversationHistory(conversationId),
        this.loadMemories(payload.message, conversationId),
      ]);

      try {
        turnId = await this.startTurn(conversationId, payload.message);
      } catch (error) {
        this.logger.warn(
          `startTurn failed: conversationId=${conversationId} message=${errorMessage(error)}`,
        );
        emit(
          this.finalEvent(
            conversationId,
            this.errorResponse(this.startTurnErrorMessage(error)),
          ),
        );
        return;
      }

      this.abortRegistry.register(turnId, ac);
      emit({
        event: STREAM_EVENT.TURN,
        conversationId,
        turnId,
      });

      let outcome: ChatOutcome;
      try {
        outcome = await this.resolveOutcome(
          payload.message,
          turns,
          memories,
          turnId,
          emit,
        );
      } catch (error) {
        if (!isAbortError(error)) throw error;
        // 汇总还没出来才写成 cancelled。已经有可写结果则走下面的 CompleteTurn(success)。
        outcome = this.cancelledOutcome();
      }

      try {
        const landed = await this.completeTurn(
          turnId,
          outcome.status,
          outcome.payload,
          outcome.memory,
        );
        emit(this.finalEvent(conversationId, landed));
      } catch (error) {
        this.logger.error(
          `Failed to complete turn status=${outcome.status} turnId=${turnId}: ${errorMessage(error)}`,
          error instanceof Error ? error : undefined,
        );
        emit(
          this.finalEvent(
            conversationId,
            this.errorResponse(MESSAGE_CONSTANTS.COMPLETE_TURN_FAILED),
          ),
        );
      }
    } catch (error) {
      this.logger.error(
        `chat failed: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined,
      );
      emit({
        event: STREAM_EVENT.ERROR,
        conversationId,
        message: MESSAGE_CONSTANTS.UNEXPECTED_FAILURE,
      });
    } finally {
      if (turnId) this.abortRegistry.unregister(turnId);
    }
  }

  /**
   * 只负责跑工作流并收成 outcome，不写会话。
   */
  private async resolveOutcome(
    query: string,
    turns: ConversationHistoryItem[],
    memories: ConversationMemory[],
    turnId: string,
    emit: (event: ChatStreamEvent) => void,
  ): Promise<ChatOutcome> {
    try {
      const model = this.modelProvider.getModel();
      const ctx = new WorkflowContext({
        query,
        turns,
        memories,
        events: this.createEventSink(turnId, emit),
      });
      // 固定记一条：0 条召回和"根本没召回"要能区分开。
      await ctx.record({
        kind: "memory",
        actor: "orchestrator",
        recalled: memories.length,
        topScore: memories[0]?.score ?? 0,
      });
      const orchestratorResult = await this.orchestratorAgent.orchestrate(
        model,
        ctx,
      );
      this.logger.log(
        `[Orchestrator] intentType=${orchestratorResult.intent_type}, success=${orchestratorResult.success}`,
      );
      return this.outcomeFromOrchestrator(orchestratorResult);
    } catch (error) {
      if (isAbortError(error)) throw error;
      const workflowError = error as Error & { stage?: string };
      this.logger.error(
        `Orchestrator workflow failed: stage=${workflowError.stage ?? "unknown"} message=${workflowError.message}`,
        workflowError,
      );
      return {
        status: TURN_STATUS.ERROR,
        payload: {
          kind: "error",
          message: workflowError.message ?? "Agent 工作流执行失败",
        },
      };
    }
  }

  private outcomeFromOrchestrator(
    result: OrchestratorResult,
  ): ChatOutcome {
    if (
      result.intent_type === INTENT_TYPE.OUT_OF_SCOPE ||
      result.intent_type === INTENT_TYPE.UNKNOWN
    ) {
      const fallback =
        result.intent_type === INTENT_TYPE.UNKNOWN
          ? MESSAGE_CONSTANTS.DEFAULT_UNKNOWN_INTENT_MESSAGE
          : MESSAGE_CONSTANTS.DEFAULT_OUT_OF_SCOPE_MESSAGE;
      return {
        status: TURN_STATUS.REJECT,
        payload: {
          kind: TURN_STATUS.REJECT,
          message: result.result || fallback,
        },
      };
    }

    if (!result.success) {
      return {
        status: TURN_STATUS.ERROR,
        payload: {
          kind: "error",
          message: result.result || "Agent 工作流执行失败",
        },
      };
    }

    const parsed = this.parseRecommendation(result.result);
    if (!parsed) {
      return {
        status: TURN_STATUS.ERROR,
        payload: {
          kind: "error",
          message: "无法根据检索结果生成推荐。",
        },
      };
    }

    return {
      status: TURN_STATUS.SUCCESS,
      payload: parsed.payload,
      memory: parsed.memory,
    };
  }

  private cancelledOutcome(): ChatOutcome {
    const payload: CancelledPayload = {
      kind: TURN_STATUS.CANCELLED,
      message: MESSAGE_CONSTANTS.CANCELLED,
    };
    return {
      status: TURN_STATUS.CANCELLED,
      payload,
    };
  }

  private timeoutOutcome(): ChatOutcome {
    const payload: ErrorPayload = {
      kind: "error",
      message: MESSAGE_CONSTANTS.TURN_TIMEOUT,
    };
    return {
      status: TURN_STATUS.ERROR,
      payload,
    };
  }

  private errorResponse(message: string): Pick<ChatTurnResult, "type" | "data"> {
    const payload: ErrorPayload = { kind: "error", message };
    return { type: TURN_STATUS.ERROR, data: payload };
  }

  private finalEvent(
    conversationId: string,
    body: Pick<ChatTurnResult, "type" | "data">,
  ): ChatStreamFinalEvent {
    return {
      event: STREAM_EVENT.FINAL,
      conversationId,
      type: body.type,
      data: body.data,
    };
  }

  private startTurnErrorMessage(error: unknown): string {
    if (grpcCode(error) === GrpcStatus.FAILED_PRECONDITION) {
      return grpcDetails(error) || MESSAGE_CONSTANTS.TURN_IN_PROGRESS;
    }
    return MESSAGE_CONSTANTS.START_TURN_FAILED;
  }

  private async ensureConversation(payload: ChatPayload): Promise<string> {
    if (payload.conversationId) return payload.conversationId;

    const response = await this.messageGrpcClient.createConversation({
      title: payload.message,
    });
    return response.conversation_id;
  }

  private async loadConversationHistory(
    conversationId: string,
  ): Promise<ConversationHistoryItem[]> {
    if (!conversationId) return [];

    const response =
      await this.messageGrpcClient.getConversation(conversationId);
    return toConversationTurns(response?.messages);
  }

  /**
   * 召回该用户其它会话里的长期记忆。位于关键路径上，
   * 任何失败都退化成"没有记忆"，绝不让向量检索拖垮本轮回答。
   */
  private async loadMemories(
    query: string,
    conversationId: string,
  ): Promise<ConversationMemory[]> {
    try {
      const response = await this.messageGrpcClient.searchMemories(
        query,
        conversationId,
        MEMORY_CONSTANTS.MAX_ITEMS,
      );
      return toConversationMemories(response?.memories);
    } catch (error) {
      this.logger.warn(`loadMemories failed: ${errorMessage(error)}`);
      return [];
    }
  }

  private async startTurn(
    conversationId: string,
    text: string,
  ): Promise<string> {
    const response = await this.messageGrpcClient.startTurn(conversationId, {
      kind: "user_query",
      text,
    });
    if (!response.turn_id) {
      throw new Error(MESSAGE_CONSTANTS.START_TURN_FAILED);
    }
    return response.turn_id;
  }

  /**
   * 写入失败必须抛出。调用方按返回值推 `final`（CAS 输了则是对方写入的气泡）。
   */
  private async completeTurn(
    turnId: string,
    status: FinishedTurnStatus,
    payload: AssistantPayload,
    memory?: string,
  ): Promise<Pick<ChatTurnResult, "type" | "data">> {
    if (!turnId) {
      throw new Error("turnId is required to complete a turn");
    }

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.messageGrpcClient.completeTurn(
          turnId,
          status,
          payload,
          memory,
        );
        const landedType = isFinishedTurnStatus(response.status)
          ? response.status
          : status;
        const landedPayload = assistantPayloadFromJson(
          response.assistant_payload_json,
          payload,
        );
        return { type: landedType, data: landedPayload };
      } catch (error) {
        if (grpcCode(error) === GrpcStatus.NOT_FOUND) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error(MESSAGE_CONSTANTS.COMPLETE_TURN_FAILED);
  }

  private createEventSink(
    turnId: string,
    emit: (event: ChatStreamEvent) => void,
  ): TurnEventSink {
    if (!turnId) return noopTurnEventSink;

    return {
      record: async (body) => {
        try {
          await this.messageGrpcClient.appendTurnEvent(turnId, body);
        } catch (error) {
          this.logger.warn(
            `Failed to append turn event kind=${body.kind}`,
            error as Error,
          );
        }
        const stage = toStreamStageEvent(body);
        if (!stage) return;
        try {
          emit(stage);
        } catch (error) {
          this.logger.warn(
            `Failed to emit stream stage kind=${body.kind}`,
            error as Error,
          );
        }
      },
    };
  }

  /**
   * 汇总 JSON → 可见气泡 payload + 不可见的长期记忆。
   * 只解析，不负责生成；`memory` 刻意不进 payload，避免出现在气泡和 SSE 里。
   */
  private parseRecommendation(
    text: string,
  ): { payload: RecommendationPayload; memory: string } | null {
    const parsed = tryParseJson<Record<string, unknown>>(text, "recommendation");
    if (!parsed) return null;
    const payload = recommendationFromParsed(parsed);
    if (!getStringValue(payload.text)) return null;
    return { payload, memory: getStringValue(parsed.memory) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function grpcCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "number" ? error.code : undefined;
}

function grpcDetails(error: unknown): string {
  if (typeof error !== "object" || error === null || !("details" in error)) {
    return "";
  }
  return typeof error.details === "string" ? error.details.trim() : "";
}

function assistantPayloadFromJson(
  json: string | undefined,
  fallback: AssistantPayload,
): AssistantPayload {
  if (!json) return fallback;
  const parsed = tryParseJson<AssistantPayload>(json);
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
    return fallback;
  }
  return parsed;
}
