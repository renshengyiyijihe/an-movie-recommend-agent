import { Injectable, Logger } from '@nestjs/common';

type TmdbSearchRequest = {
  query: string;
  max_results?: number;
  language?: string;
  page?: number;
  include_adult?: boolean;
};

type TmdbSearchResult = {
  title: string;
  url: string;
  overview?: string;
  score?: number;
  release_date?: string;
  poster_url?: string;
  id: number;
  original_title?: string;
};

type TmdbSearchResponse = {
  query: string;
  results: TmdbSearchResult[];
  total_results?: number;
  request_id?: string;
};

@Injectable()
export class TmdbProvider {
  private readonly logger = new Logger(TmdbProvider.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly apiUrl = process.env.TMDB_API_URL || 'https://api.themoviedb.org/3';

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, options: Partial<TmdbSearchRequest> = {}): Promise<TmdbSearchResponse> {
    if (!this.apiKey) {
      this.logger.error('TMDB API key is not configured.');
      throw new Error('TMDB API key is not configured.');
    }

    const encoded = encodeURIComponent(query);
    const language = options.language ?? 'zh-CN';
    const page = options.page ?? 1;
    const includeAdult = options.include_adult ?? false;

    const url = `${this.apiUrl}/search/movie?api_key=${this.apiKey}&language=${language}&query=${encoded}&page=${page}&include_adult=${includeAdult}`;

    this.logger.log(`TMDB search request: queryLength=${query.length}, max_results=${options.max_results ?? 4}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(`TMDB search request failed with status ${response.status}: ${errorText}`);
      throw new Error(`TMDB search request failed with status ${response.status}`);
    }

    const json = await response.json();
    const results = (Array.isArray(json.results) ? json.results : []).slice(0, options.max_results ?? 4).map((item: any) => ({
      title: item.title || item.original_title || '未知电影',
      url: item.id ? `https://www.themoviedb.org/movie/${item.id}` : '',
      overview: item.overview ?? '',
      score: item.vote_average ?? 0,
      release_date: item.release_date ?? '',
      poster_url: item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : '',
      id: item.id ?? 0,
      original_title: item.original_title,
    }));

    this.logger.log(`TMDB search response success: results=${results.length}`);
    return {
      query,
      results,
      total_results: json.total_results,
      request_id: `${Date.now()}`,
    };
  }
}
