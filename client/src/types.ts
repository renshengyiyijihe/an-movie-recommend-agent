export type {
  AssistantPayload,
  ConversationChatItem,
  ConversationDetail,
  ConversationSummary,
  ErrorCode,
  ErrorPayload,
  ErrorResponseBody,
  RecommendationItem,
  RecommendationPayload,
  RecommendResponse,
  RejectPayload,
  UserMessagePayload,
} from "@an-movie/contracts";

import type {
  ErrorPayload,
  RecommendationPayload,
  RejectPayload,
  UserMessagePayload,
} from "@an-movie/contracts";

export type ChatMessage =
  | { role: "user"; kind: "user_query"; payload: UserMessagePayload }
  | { role: "assistant"; kind: "recommendation"; payload: RecommendationPayload }
  | { role: "assistant"; kind: "reject"; payload: RejectPayload }
  | { role: "assistant"; kind: "error"; payload: ErrorPayload };
