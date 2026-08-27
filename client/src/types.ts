export type {
  AssistantPayload,
  CancelledPayload,
  ConversationChatItem,
  ConversationDetail,
  ConversationSummary,
  ErrorCode,
  ErrorPayload,
  ErrorResponseBody,
  RecommendationItem,
  RecommendationPayload,
  ChatTurnResult,
  RejectPayload,
  UserMessagePayload,
} from "@an-movie/contracts";

import type {
  ErrorPayload,
  RecommendationPayload,
  RejectPayload,
  CancelledPayload,
  UserMessagePayload,
} from "@an-movie/contracts";

export type ChatMessage =
  | { role: "user"; kind: "user_query"; payload: UserMessagePayload }
  | { role: "assistant"; kind: "recommendation"; payload: RecommendationPayload }
  | { role: "assistant"; kind: "reject"; payload: RejectPayload }
  | { role: "assistant"; kind: "error"; payload: ErrorPayload }
  | { role: "assistant"; kind: "cancelled"; payload: CancelledPayload };
