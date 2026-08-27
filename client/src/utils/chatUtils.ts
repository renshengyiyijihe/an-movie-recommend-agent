import {
  RecommendationItem,
  ChatMessage,
  ConversationChatItem,
  RecommendationPayload,
} from '@/types';
import { TURN_STATUS } from '@an-movie/contracts';
import { TEXT } from '@/constant';

const TMDB_GENRE_MAP: Record<number, string> = {
  28: '动作',
  12: '冒险',
  16: '动画',
  35: '喜剧',
  80: '犯罪',
  99: '纪录片',
  18: '剧情',
  10751: '家庭',
  14: '奇幻',
  36: '历史',
  27: '恐怖',
  10402: '音乐',
  9648: '悬疑',
  10749: '爱情',
  878: '科幻',
  10770: '电视电影',
  53: '惊悚',
  10752: '战争',
  37: '西部',
};

export function getRecommendationGenres(item: RecommendationItem) {
  const explicitGenres = Array.isArray(item.genres) ? item.genres.filter(Boolean) : [];
  const explicitGenreNames = Array.isArray(item.genre_names) ? item.genre_names.filter(Boolean) : [];
  const mappedGenres = (Array.isArray(item.genre_ids) ? item.genre_ids : [])
    .map((genreId) => TMDB_GENRE_MAP[genreId])
    .filter(Boolean) as string[];

  return Array.from(new Set([...explicitGenres, ...explicitGenreNames, ...mappedGenres]));
}

export function renderMessageText(text: string) {
  return text.split('\n').filter((line) => line.trim() !== '');
}

export function convertConversationToMessages(
  messages: ConversationChatItem[],
): ChatMessage[] {
  return messages.map(toChatMessage);
}

export function chatItemPreviewText(item: ConversationChatItem): string {
  const message = toChatMessage(item);
  const text = chatMessageText(message);
  if (text) return text;
  return message.kind === 'recommendation' ? '推荐结果' : '';
}

export function chatMessageText(item: ChatMessage): string {
  if (item.kind === 'user_query' || item.kind === 'recommendation') {
    return item.payload.text;
  }
  return item.payload.message;
}

export function chatMessageMovies(item: ChatMessage): RecommendationItem[] {
  return item.kind === 'recommendation' ? item.payload.movies : [];
}

export function toChatMessage(item: ConversationChatItem): ChatMessage {
  const payload = asRecord(item.payload);
  const kind =
    typeof payload.kind === 'string'
      ? payload.kind
      : item.kind || (item.role === 'user' ? 'user_query' : 'recommendation');

  if (item.role === 'user' || kind === 'user_query') {
    return {
      role: 'user',
      kind: 'user_query',
      payload: {
        kind: 'user_query',
        text: readString(payload, 'text'),
      },
    };
  }

  if (kind === 'reject') {
    return {
      role: 'assistant',
      kind: 'reject',
      payload: {
        kind: 'reject',
        message: readString(payload, 'message') || '这个查询与电影或演员无关',
      },
    };
  }

  if (kind === 'error') {
    return {
      role: 'assistant',
      kind: 'error',
      payload: {
        kind: 'error',
        message: readString(payload, 'message') || '推荐流程执行失败',
      },
    };
  }

  if (kind === TURN_STATUS.CANCELLED) {
    return {
      role: 'assistant',
      kind: TURN_STATUS.CANCELLED,
      payload: {
        kind: TURN_STATUS.CANCELLED,
        message: readString(payload, 'message') || TEXT.chat.cancelled,
      },
    };
  }

  return {
    role: 'assistant',
    kind: 'recommendation',
    payload: recommendationPayloadFromRecord(payload),
  };
}

export function toAssistantMessage(result: {
  type?: string;
  data?: unknown;
} | null | undefined): ChatMessage {
  const data = asRecord(result?.data);
  const kind = typeof data.kind === 'string' ? data.kind : result?.type;

  if (!result?.data) {
    return {
      role: 'assistant',
      kind: 'error',
      payload: { kind: 'error', message: '未收到有效响应，请重试。' },
    };
  }

  if (kind === 'reject') {
    return {
      role: 'assistant',
      kind: 'reject',
      payload: {
        kind: 'reject',
        message: readString(data, 'message') || '这个查询与电影或演员无关',
      },
    };
  }

  if (kind === 'error') {
    return {
      role: 'assistant',
      kind: 'error',
      payload: {
        kind: 'error',
        message: readString(data, 'message') || '推荐流程执行失败',
      },
    };
  }

  if (kind === TURN_STATUS.CANCELLED || result?.type === TURN_STATUS.CANCELLED) {
    return {
      role: 'assistant',
      kind: TURN_STATUS.CANCELLED,
      payload: {
        kind: TURN_STATUS.CANCELLED,
        message: readString(data, 'message') || TEXT.chat.cancelled,
      },
    };
  }

  const payload = recommendationPayloadFromRecord(data);
  return {
    role: 'assistant',
    kind: 'recommendation',
    payload: {
      ...payload,
      text:
        payload.text ||
        (payload.movies.length === 0 ? '无法生成推荐内容，请稍后重试。' : ''),
    },
  };
}

function recommendationPayloadFromRecord(
  payload: Record<string, unknown>,
): RecommendationPayload {
  return {
    kind: 'recommendation',
    text: readString(payload, 'text'),
    movies: readMovies(payload),
  };
}

function readMovies(payload: Record<string, unknown>): RecommendationItem[] {
  const raw = Array.isArray(payload.movies) ? payload.movies : [];

  return raw.filter(
    (item): item is RecommendationItem =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
