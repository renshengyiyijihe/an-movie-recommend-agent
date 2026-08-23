import { Injectable, Logger } from "@nestjs/common";
import { ModelProvider } from "../model/model.provider";
import { MessageGrpcClient } from "./message.grpc";
import { OrchestratorAgent } from "./agents/orchestrator.agent";
import { WorkflowContext } from "./agents/workflow-context";
import { toConversationTurns } from "./conversation-history";
import { tryParseJson } from "./helpers";
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
import { ConversationHistoryItem, INTENT_TYPE } from "./types";

interface RecommendPayload {
  message: string;
  imageUrl?: string;
  imageData?: string;
  conversationId?: string;
}

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
    const turnId = await this.startTurn(conversationId, payload.message);

    try {
      const model = this.modelProvider.getModel();
      const ctx = new WorkflowContext({
        query: payload.message,
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

      if (orchestratorResult.intent_type === INTENT_TYPE.OUT_OF_SCOPE) {
        const rejectPayload: RejectPayload = {
          kind: "reject",
          message:
            orchestratorResult.result ||
            MESSAGE_CONSTANTS.DEFAULT_OUT_OF_SCOPE_MESSAGE,
        };
        await this.completeTurn(turnId, "reject", rejectPayload);
        return {
          conversationId,
          type: "reject",
          data: rejectPayload,
        };
      }

      if (!orchestratorResult.success) {
        const errorPayload: ErrorPayload = {
          kind: "error",
          message: orchestratorResult.result || "Agent 工作流执行失败",
        };
        await this.completeTurn(turnId, "error", errorPayload);
        return {
          conversationId,
          type: "error",
          data: errorPayload,
        };
      }

      const parsed = this.parseRecommendation(orchestratorResult.result);
      await this.completeTurn(turnId, "success", parsed);
      return {
        conversationId,
        type: "success",
        data: parsed,
      };
    } catch (error) {
      const workflowError = error as Error & {
        stage?: string;
        details?: string;
      };
      this.logger.error(
        `Orchestrator workflow failed: stage=${workflowError.stage ?? "unknown"} message=${workflowError.message}`,
        workflowError,
      );
      const errorPayload: ErrorPayload = {
        kind: "error",
        message: workflowError.message ?? "Agent 工作流执行失败",
      };
      await this.completeTurn(turnId, "error", errorPayload);
      return {
        conversationId,
        type: "error",
        data: errorPayload,
      };
    }
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
    if (!conversationId) return "";

    const response = await this.messageGrpcClient.startTurn(conversationId, {
      kind: "user_query",
      text,
    });
    return response.turn_id;
  }

  private async completeTurn(
    turnId: string,
    status: TurnStatus,
    payload: AssistantPayload,
  ): Promise<void> {
    if (!turnId) return;

    try {
      await this.messageGrpcClient.completeTurn(turnId, status, payload);
    } catch (error) {
      this.logger.warn(
        `Failed to complete turn status=${status}: ${(error as Error).message}`,
        error as Error,
      );
    }
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

  private parseRecommendation(text: string): RecommendationPayload {
    return recommendationFromParsed(tryParseJson<Record<string, unknown>>(text));
  }
}
