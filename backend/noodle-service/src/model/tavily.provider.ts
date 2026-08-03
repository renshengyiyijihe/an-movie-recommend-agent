import { Injectable, Logger } from '@nestjs/common';

type TavilySearchRequest = {
  query: string;
  search_depth?: 'advanced' | 'basic' | 'fast' | 'ultra-fast';
  chunks_per_source?: number;
  max_results?: number;
  topic?: 'general' | 'news' | 'finance';
  include_answer?: boolean | 'basic' | 'advanced';
  include_raw_content?: boolean | 'markdown' | 'text';
  include_images?: boolean;
  include_image_descriptions?: boolean;
  include_favicon?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
  country?: string;
  auto_parameters?: boolean;
  include_usage?: boolean;
};

type TavilySearchResultImage = {
  url?: string;
  description?: string;
};

type TavilySearchResult = {
  title: string;
  url: string;
  content?: string;
  score?: number;
  raw_content?: string | null;
  favicon?: string;
  images?: TavilySearchResultImage[];
};

type TavilySearchResponse = {
  query: string;
  answer?: string;
  images?: TavilySearchResultImage[];
  results: TavilySearchResult[];
  auto_parameters?: Record<string, unknown>;
  response_time?: number;
  usage?: Record<string, unknown>;
  request_id?: string;
};

@Injectable()
export class TavilyProvider {
  private readonly logger = new Logger(TavilyProvider.name);
  private readonly apiKey = process.env.TAVILY_API_KEY;
  private readonly apiUrl = process.env.TAVILY_API_URL || 'https://api.tavily.com';

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, options: Partial<TavilySearchRequest> = {}): Promise<TavilySearchResponse> {
    if (!this.apiKey) {
      throw new Error('Tavily API key is not configured.');
    }

    const url = `${this.apiUrl.replace(/\/$/, '')}/search`;
    const body: TavilySearchRequest = {
      query,
      search_depth: options.search_depth ?? 'basic',
      chunks_per_source: options.chunks_per_source ?? 3,
      max_results: options.max_results ?? 4,
      topic: options.topic ?? 'general',
      include_answer: options.include_answer ?? false,
      include_raw_content: options.include_raw_content ?? false,
      include_images: options.include_images ?? false,
      include_image_descriptions: options.include_image_descriptions ?? false,
      include_favicon: options.include_favicon ?? false,
      include_domains: options.include_domains ?? [],
      exclude_domains: options.exclude_domains ?? [],
      country: options.country,
      auto_parameters: options.auto_parameters ?? false,
      include_usage: options.include_usage ?? false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(`Tavily search request failed with status ${response.status}: ${errorText}`);
      throw new Error(`Tavily search request failed with status ${response.status}`);
    }

    const json = (await response.json()) as TavilySearchResponse;
    return json;
  }
}
