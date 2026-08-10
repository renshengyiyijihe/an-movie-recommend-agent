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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'assistant-error';
  text: string;
  type?: 'recommendation' | 'explanation' | 'fallback' | 'error' | 'loading';
  imagePreview?: string;
}

export interface ConversationSummary {
  conversation_id: string;
  title?: string | null;
  created_at: string;
}

export interface ConversationDetailMessage {
  id: string;
  role: string;
  message_type: string;
  stage: string;
  content: string;
  created_at: string;
}

export interface ConversationDetail {
  conversation_id: string;
  user_id?: string | null;
  title?: string | null;
  messages: ConversationDetailMessage[];
}
