export interface RecommendationItem {
  name?: string;
  title?: string;
  reason?: string;
  summary?: string;
  overview?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  original_title?: string;
  genre_ids?: number[];
  genres?: string[];
  genre_names?: string[];
  poster_path?: string;
  poster_url?: string;
  backdrop_path?: string | null;
  backdrop_url?: string;
  tmdb_url?: string;
  id?: number;
  adult?: boolean;
  video?: boolean;
  taobao?: string;
  jd?: string;
}

export type UserMessagePayload = {
  kind: 'user_query';
  text: string;
};

export type RecommendationPayload = {
  kind: 'recommendation';
  text: string;
  movies: RecommendationItem[];
};

export type RejectPayload = {
  kind: 'reject';
  message: string;
};

export type ErrorPayload = {
  kind: 'error';
  message: string;
};

export type AssistantPayload =
  | RecommendationPayload
  | RejectPayload
  | ErrorPayload;

export type ChatMessage =
  | { role: 'user'; kind: 'user_query'; payload: UserMessagePayload }
  | { role: 'assistant'; kind: 'recommendation'; payload: RecommendationPayload }
  | { role: 'assistant'; kind: 'reject'; payload: RejectPayload }
  | { role: 'assistant'; kind: 'error'; payload: ErrorPayload };

export interface RecommendResponse {
  conversationId?: string;
  type: 'success' | 'reject' | 'error';
  data: AssistantPayload;
}

export interface ConversationSummary {
  conversation_id: string;
  title?: string | null;
  created_at: string;
}

export interface ConversationChatItem {
  id: string;
  turn_id: string;
  role: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ConversationDetail {
  conversation_id: string;
  user_id?: string | null;
  title?: string | null;
  messages: ConversationChatItem[];
}
