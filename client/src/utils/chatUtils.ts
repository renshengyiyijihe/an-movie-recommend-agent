import { RecommendationItem, ChatMessage } from '../types';

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

export function convertConversationToMessages(messages: Array<{ id: string; role: string; message_type: string; stage: string; content: string; created_at: string; }>): ChatMessage[] {
  return messages.map((item) => ({
    role: item.role === 'user' ? 'user' : 'assistant',
    text: item.content,
    type: item.message_type === 'final_response' ? 'recommendation' : item.role === 'user' ? undefined : 'explanation',
  }));
}

export function convertResultToMessages(result: any): ChatMessage[] {
  if (!result?.data) {
    return [{ role: 'assistant-error', text: '未收到有效响应，请重试。', type: 'error' }];
  }

  const { data } = result;
  const sections: ChatMessage[] = [];

  if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
    sections.push({
      role: 'assistant',
      text: JSON.stringify(data.recommendations),
      type: 'recommendation',
    });
  }

  if (data.explanation) {
    sections.push({
      role: 'assistant',
      text: `推荐说明：\n${data.explanation}`,
      type: 'explanation',
    });
  }

  if ((!data.recommendations || data.recommendations.length === 0) && (data.message || data.fallback_reason)) {
    sections.push({
      role: 'assistant-error',
      text: data.message ? `${data.message}` : `兜底说明：\n${data.fallback_reason}`,
      type: 'fallback',
    });
  } else {
    if (data.message) {
      sections.push({
        role: 'assistant',
        text: `${data.message}`,
        type: 'explanation',
      });
    }
  }

  if (sections.length === 0) {
    return [{ role: 'assistant-error', text: '无法生成推荐内容，请稍后重试。', type: 'error' }];
  }

  return sections;
}
