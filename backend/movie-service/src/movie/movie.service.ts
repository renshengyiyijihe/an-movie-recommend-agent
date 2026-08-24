import { Injectable, Logger } from "@nestjs/common";
import { status as GrpcStatus } from "@grpc/grpc-js";
import { ModelProvider } from "../model/model.provider";
import { MessageGrpcClient } from "./message.grpc";
import { OrchestratorAgent } from "./agents/orchestrator.agent";
import { WorkflowContext } from "./agents/workflow-context";
import { toConversationTurns } from "./conversation-history";
import { getStringValue, tryParseJson } from "./helpers";
import { MESSAGE_CONSTANTS } from "./constants";
import {
  AssistantPayload,
  ErrorPayload,
  RecommendationPayload,
  RejectPayload,
  TurnStatus,
  recommendationFromParsed,
} from "./transcript";
import { noopTurnEventSink, TurnEventSink } from "./turn-events";
import {
  ConversationHistoryItem,
  INTENT_TYPE,
  OrchestratorResult,
} from "./types";

interface RecommendPayload {
  message: string;
  imageUrl?: string;
  imageData?: string;
  conversationId?: string;
}

/**
 * 工作流结论。HTTP `type` 与 CompleteTurn 的 `status` 共用同一套取值。
 * 必须先写入再返回；写入失败不得冒充 success / reject。
 */
type RecommendOutcome =
  | { type: "success"; status: "success"; payload: RecommendationPayload }
  | { type: "reject"; status: "reject"; payload: RejectPayload }
  | { type: "error"; status: "error"; payload: ErrorPayload };

@Injectable()
export class MovieService {
  private readonly logger = new Logger(MovieService.name);

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly messageGrpcClient: MessageGrpcClient,
    private readonly orchestratorAgent: OrchestratorAgent,
  ) {}

  async recommend(payload: RecommendPayload) {
    this.logger.log(
      `recommend request received: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}`,
    );

    const conversationId = await this.ensureConversation(payload);
    const turns = await this.loadConversationHistory(conversationId);

    let turnId: string;
    try {
      turnId = await this.startTurn(conversationId, payload.message);
    } catch (error) {
      this.logger.warn(
        `startTurn failed: conversationId=${conversationId} message=${errorMessage(error)}`,
      );
      return this.errorResponse(
        conversationId,
        this.startTurnErrorMessage(error),
      );
    }

    const outcome = await this.resolveOutcome(
      payload.message,
      turns,
      turnId,
    );

    try {
      await this.completeTurn(turnId, outcome.status, outcome.payload);
    } catch (error) {
      this.logger.error(
        `Failed to complete turn status=${outcome.status} turnId=${turnId}: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined,
      );
      return this.errorResponse(
        conversationId,
        MESSAGE_CONSTANTS.COMPLETE_TURN_FAILED,
      );
    }

    return {
      conversationId,
      type: outcome.type,
      data: outcome.payload,
    };
  }

  /**
   * 只负责跑工作流并收成 outcome，不写会话。
   */
  private async resolveOutcome(
    query: string,
    turns: ConversationHistoryItem[],
    turnId: string,
  ): Promise<RecommendOutcome> {
    try {
      const model = this.modelProvider.getModel();
      const ctx = new WorkflowContext({
        query,
        turns,
        events: this.createEventSink(turnId),
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
      const workflowError = error as Error & { stage?: string };
      this.logger.error(
        `Orchestrator workflow failed: stage=${workflowError.stage ?? "unknown"} message=${workflowError.message}`,
        workflowError,
      );
      return {
        type: "error",
        status: "error",
        payload: {
          kind: "error",
          message: workflowError.message ?? "Agent 工作流执行失败",
        },
      };
    }
  }

  private outcomeFromOrchestrator(
    result: OrchestratorResult,
  ): RecommendOutcome {
    if (result.intent_type === INTENT_TYPE.OUT_OF_SCOPE) {
      return {
        type: "reject",
        status: "reject",
        payload: {
          kind: "reject",
          message:
            result.result || MESSAGE_CONSTANTS.DEFAULT_OUT_OF_SCOPE_MESSAGE,
        },
      };
    }

    if (!result.success) {
      return {
        type: "error",
        status: "error",
        payload: {
          kind: "error",
          message: result.result || "Agent 工作流执行失败",
        },
      };
    }

    const parsed = this.parseRecommendation(result.result);
    if (!parsed) {
      return {
        type: "error",
        status: "error",
        payload: {
          kind: "error",
          message: "无法根据检索结果生成推荐。",
        },
      };
    }

    return { type: "success", status: "success", payload: parsed };
  }

  private errorResponse(conversationId: string, message: string) {
    const payload: ErrorPayload = { kind: "error", message };
    return { conversationId, type: "error" as const, data: payload };
  }

  private startTurnErrorMessage(error: unknown): string {
    if (grpcCode(error) === GrpcStatus.FAILED_PRECONDITION) {
      return grpcDetails(error) || MESSAGE_CONSTANTS.TURN_IN_PROGRESS;
    }
    return MESSAGE_CONSTANTS.START_TURN_FAILED;
  }

  private async ensureConversation(payload: RecommendPayload): Promise<string> {
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
   * 写入失败必须抛出。调用方不得在写入前把 outcome 当成已落库。
   */
  private async completeTurn(
    turnId: string,
    status: TurnStatus,
    payload: AssistantPayload,
  ): Promise<void> {
    if (!turnId) {
      throw new Error("turnId is required to complete a turn");
    }

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.messageGrpcClient.completeTurn(turnId, status, payload);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error(MESSAGE_CONSTANTS.COMPLETE_TURN_FAILED);
  }

  private createEventSink(turnId: string): TurnEventSink {
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
      },
    };
  }

  private parseRecommendation(text: string): RecommendationPayload | null {
    const parsed = tryParseJson<Record<string, unknown>>(text, "recommendation");
    if (!parsed) return null;
    const payload = recommendationFromParsed(parsed);
    if (!getStringValue(payload.text)) return null;
    return payload;
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
