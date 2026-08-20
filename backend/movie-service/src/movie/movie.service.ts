import { Injectable, Logger } from "@nestjs/common";
import { ModelProvider } from "../model/model.provider";
import { AuthGrpcClient } from "./auth.grpc";
import {
  MessageGrpcClient,
} from "./message.grpc";
import { OrchestratorAgent } from "./agents/orchestrator.agent";
import { WorkflowContext } from "./agents/workflow-context";
import { toConversationTurns } from "./conversation-history";
import { getStringValue, tryParseJson } from "./helpers";
import {
  ConversationHistoryItem,
  MessageRole,
  MessageStage,
  MessageType,
} from "./types";

interface RecommendPayload {
  message: string;
  imageUrl?: string;
  imageData?: string;
  history?: ConversationHistoryItem[];
  conversationId?: string;
}

interface AuthResult {
  ok: boolean;
  user?: { id: string; email: string };
  error?: string;
}

@Injectable()
export class MovieService {
  private readonly logger = new Logger(MovieService.name);

  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly authGrpcClient: AuthGrpcClient,
    private readonly messageGrpcClient: MessageGrpcClient,
    private readonly orchestratorAgent: OrchestratorAgent,
  ) {}

  async recommend(payload: RecommendPayload, authorization?: string) {
    this.logger.log(
      `recommend request received: messageLength=${payload.message?.length ?? 0}, hasImage=${Boolean(payload.imageUrl || payload.imageData)}, authHeader=${authorization ? "present" : "absent"}`,
    );

    const authResult = authorization
      ? await this.validateAuthorization(authorization)
      : { ok: false, error: "no_authorization_header" };
    const conversationId = await this.ensureConversation(payload, authResult);
    const turns = await this.loadConversationHistory(conversationId);

    await this.appendConversationMessage(
      conversationId,
      "user",
      "user_query",
      "start",
      payload.message,
    );

    try {
      const model = this.modelProvider.getModel();
      const ctx = new WorkflowContext({
        query: payload.message,
        turns,
      });
      const orchestratorResult = await this.orchestratorAgent.orchestrate(
        model,
        ctx,
      );

      this.logger.log(
        `[Orchestrator] intentType=${orchestratorResult.intent_type}, success=${orchestratorResult.success}`,
      );

      if (
        !orchestratorResult.success ||
        orchestratorResult.intent_type === "out_of_scope"
      ) {
        await this.appendConversationMessage(
          conversationId,
          "assistant",
          "agent_execution",
          "final",
          orchestratorResult.result,
        );
        return {
          type: "reject",
          data: {
            message:
              orchestratorResult.result ||
              "我主要负责电影推荐或介绍。如果你想问电影类型、演员、风格、时长或推荐电影，我可以继续帮你。",
            summary: "",
            topics: [],
            entities: [],
          },
        };
      }

      await this.appendConversationMessage(
        conversationId,
        "assistant",
        "agent_execution",
        "workflow_complete",
        `使用的Agent: ${orchestratorResult.agents_used.join(", ")}`,
      );
      await this.appendConversationMessage(
        conversationId,
        "assistant",
        "agent_execution",
        "intent_classification",
        "in_scope",
      );

      const parsed = this.parseRecommendation(orchestratorResult.result);
      await this.appendConversationMessage(
        conversationId,
        "assistant",
        "final_response",
        "final",
        JSON.stringify(parsed),
        parsed.summary,
        parsed.topics,
        parsed.entities,
        await this.getLatestUserMessageId(conversationId),
      );

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
      return this.buildErrorResponse(payload, {
        stage: workflowError.stage ?? "orchestrator",
        message: workflowError.message ?? "Agent 工作流执行失败",
        details: workflowError.details ?? "请查看服务日志获取完整上下文",
      });
    }
  }

  private async ensureConversation(
    payload: RecommendPayload,
    authResult: AuthResult,
  ): Promise<string> {
    if (payload.conversationId) return payload.conversationId;

    try {
      const response = await this.messageGrpcClient.createConversation({
        user_id: authResult.ok ? authResult.user?.id : undefined,
        title: payload.message,
      });
      return response.conversation_id;
    } catch (error) {
      this.logger.warn(
        `Failed to create conversation: ${(error as Error)?.message ?? String(error)}`,
      );
      return "";
    }
  }

  private async loadConversationHistory(
    conversationId: string,
  ): Promise<ConversationHistoryItem[]> {
    if (!conversationId) return [];

    try {
      const response = await this.messageGrpcClient.getConversation({
        conversation_id: conversationId,
      });
      return toConversationTurns(response?.messages);
    } catch (error) {
      this.logger.warn(
        `Failed to load conversation history: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private async appendConversationMessage(
    conversationId: string,
    role: MessageRole,
    messageType: MessageType,
    stage: MessageStage,
    content?: string,
    summary?: string,
    topics?: string[],
    entities?: string[],
    userMessageId?: string,
  ): Promise<void> {
    if (!conversationId) return;

    try {
      await this.messageGrpcClient.appendMessage({
        conversation_id: conversationId,
        role,
        message_type: messageType,
        stage,
        content,
        summary,
        topics,
        entities,
        user_message_id: userMessageId,
      });
    } catch (error) {
      this.logger.warn("Failed to append conversation message", error as Error);
    }
  }

  private async getLatestUserMessageId(
    conversationId: string,
  ): Promise<string | undefined> {
    if (!conversationId) return undefined;

    try {
      const conversation = await this.messageGrpcClient.getConversation({
        conversation_id: conversationId,
      });
      const messages = conversation?.messages ?? [];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === "user") return messages[index].id;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to resolve latest user message id: ${(error as Error).message}`,
      );
    }
    return undefined;
  }

  private async validateAuthorization(authorization: string): Promise<AuthResult> {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false, error: "no_token" };

    try {
      const response = await this.authGrpcClient.validateToken(token);
      if (!response.ok) {
        return { ok: false, error: response.error ?? "invalid_token" };
      }
      return {
        ok: true,
        user: {
          id: response.user?.id ?? "",
          email: response.user?.email ?? "",
        },
      };
    } catch (error) {
      this.logger.error("validateAuthorization exception", error as Error);
      return { ok: false, error: "grpc_error" };
    }
  }

  private buildErrorResponse(
    payload: RecommendPayload,
    error: { stage: string; message: string; details?: string },
  ) {
    return {
      type: "error",
      data: {
        message: `推荐流程执行失败：${error.message}`,
        fallback_reason: error.message,
        summary: "",
        topics: [],
        entities: [],
        error: {
          stage: error.stage,
          message: error.message,
          details: error.details ?? "无额外详情",
          requestMessage: payload.message,
        },
      },
    };
  }

  private parseRecommendation(text: string) {
    const parsed = tryParseJson<Record<string, unknown>>(text);
    if (!parsed) {
      return {
        recommendations: [],
        message: "解析失败，无法生成推荐。",
        fallback_reason: "无法解析模型输出。",
        explanation: "",
        summary: "",
        topics: [],
        entities: [],
      };
    }

    const stringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.map((item) => getStringValue(item)).filter(Boolean)
        : [];

    return {
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
      explanation: getStringValue(parsed.explanation),
      message: getStringValue(parsed.message),
      fallback_reason: getStringValue(parsed.fallback_reason),
      summary: getStringValue(parsed.summary),
      topics: stringArray(parsed.topics),
      entities: stringArray(parsed.entities),
    };
  }
}
