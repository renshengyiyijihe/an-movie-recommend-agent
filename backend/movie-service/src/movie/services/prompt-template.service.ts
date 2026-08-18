import { Injectable, Logger } from "@nestjs/common";

/**
 * Prompt模板服务
 * 统一管理所有LLM prompt，采用Markdown格式便于维护
 */
@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);

  /**
   * 系统级电影推荐prompt
   */
  getSystemPrompt(): string {
    return `# 电影推荐专家

你是一个电影推荐专家智能体。

## 职责
- 根据用户描述的影片类型、心情、演员、时长、评分偏好，给出 3-4 个推荐
- 如果用户提供了图片，请简要分析图片里的风格、场景或情绪
- 输出必须为纯 JSON 格式

## 输出格式

输出格式必须为纯 JSON，顶层字段必须包含：
- \`recommendations\` (数组) - 推荐电影列表
- \`explanation\` (字符串) - 推荐说明
- \`preferences\` (对象) - 规范化后的用户偏好

### 推荐对象示例
\`\`\`json
{
  "name": "电影名",
  "reason": "推荐理由",
  "summary": "简短介绍",
  "poster_url": "https://...",
  "tmdb_url": "https://...",
  "id": 12345
}
\`\`\`

### 完整输出示例
\`\`\`json
{
  "recommendations": [
    {
      "name": "盗梦空间",
      "reason": "紧张且富有想象力",
      "summary": "一支入侵梦境的团队执行高风险任务...",
      "poster_url": "https://image.tmdb.org/t/p/w500/xxx.jpg",
      "tmdb_url": "https://www.themoviedb.org/movie/27205",
      "id": 27205
    }
  ],
  "explanation": "基于你偏好科幻与心理悬疑，推荐以下影片...",
  "preferences": {
    "genre": "科幻",
    "mood": "紧张刺激"
  }
}
\`\`\`

## 降级方案
如果无法生成推荐，可使用 \`fallback_reason\` 字段说明原因。
`;
  }

  /**
   * 用户偏好提取prompt
   */
  getPreferenceExtractionPrompt(userMessage: string, existingPreferences: string): string {
    return `# 电影偏好提取

## 任务
从用户输入中提取结构化偏好。

## 输出要求
必须输出一个纯 JSON 对象，如果某项无法确定，请使用空字符串。

## 支持的参数字段

### 基础与分页
- \`language\` (string): 接口返回内容的语言，默认 "zh-CN"，可选 "en-US" 等
- \`region\` (string): 所在国家/地区代码（ISO 3166-1，如 "US", "CN"）
- \`sort_by\` (string): 排序规则，可选值：
  - \`popularity.desc\` / \`popularity.asc\`
  - \`vote_average.desc\` / \`vote_average.asc\`
  - \`primary_release_date.desc\` / \`primary_release_date.asc\`
  - \`revenue.desc\` / \`revenue.asc\`
  - \`vote_count.desc\` / \`vote_count.asc\`
- \`page\` (integer): 返回的页码，默认 1
- \`include_adult\` (boolean): 是否包含成人/限制级内容，默认 false
- \`include_video\` (boolean): 是否包含视频记录，默认 false

### 时间与日期
- \`primary_release_year\` (integer): 首发国家上映年份，如 2023
- \`primary_release_date.gte\` (string): 首发上映日期下限，格式 "YYYY-MM-DD"
- \`primary_release_date.lte\` (string): 首发上映日期上限，格式 "YYYY-MM-DD"
- \`release_date.gte\` (string): 任意地区上映日期下限，格式 "YYYY-MM-DD"
- \`release_date.lte\` (string): 任意地区上映日期上限，格式 "YYYY-MM-DD"
- \`year\` (integer): 任意地区上映年份
- \`with_release_type\` (string/integer): 发行类型（多选时用 ',' 表示且，'|' 表示或）
  - 1=首映, 2=点映, 3=影院, 4=数字/流媒体, 5=实体, 6=电视

### 评分与评价人数
- \`vote_average.gte\` (number): 最低评分下限（0.0-10.0），如 8.0 表示8分以上
- \`vote_average.lte\` (number): 最高评分上限（0.0-10.0）
- \`vote_count.gte\` (number): 最少打分人数下限，用于过滤冷门影片，如 100
- \`vote_count.lte\` (number): 最多打分人数上限

### 片长范围
- \`with_runtime.gte\` (integer): 片长最小值（单位：分钟）
- \`with_runtime.lte\` (integer): 片长最大值（单位：分钟）

### 语言与国家
- \`with_original_language\` (string): 电影原声语言代码
  - "ja"=日语, "en"=英语, "zh"=中文, "ko"=韩语
- \`with_origin_country\` (string): 出品国家/地区代码
  - "US"=美国, "JP"=日本, "CN"=中国大陆

### 阵容、流派与主题
- \`with_genres\` (string): 包含的流派 ID（多选时 ',' 表示且，'|' 表示或）
- \`without_genres\` (string): 排除的流派 ID
- \`with_cast\` (string): 包含的演员 ID
- \`with_crew\` (string): 包含的幕后人员/导演 ID
- \`with_people\` (string): 包含的演职人员 ID
- \`with_companies\` (string): 包含的制作公司 ID
- \`without_companies\` (string): 排除的制作公司 ID
- \`with_keywords\` (string): 包含的主题/关键词 ID
- \`without_keywords\` (string): 排除的主题/关键词 ID

### 分级与家长控制
- \`certification\` (string): 电影分级（如 "PG-13", "R"），需配合 \`certification_country\`
- \`certification.gte\` (string): 分级下限
- \`certification.lte\` (string): 分级上限
- \`certification_country\` (string): 分级对应的国家代码，如 "US"

### 流媒体与播放平台
- \`watch_region\` (string): 播放服务所在的地区代码，如 "US"
- \`with_watch_providers\` (string): 包含的播放平台 ID（如 Netflix）
- \`without_watch_providers\` (string): 排除的播放平台 ID
- \`with_watch_monetization_types\` (string): 观看变现模式，需配合 \`watch_region\`
  - "flatrate"=订阅, "free"=免费, "ads"=含广告, "rent"=租借, "buy"=购买

## 逻辑解析与处理规则

### 多选项组合逻辑
- 当用户要求"既要A又要B"时，参数值内部用逗号 ',' 连接
- 当用户要求"要么A要么B"时，参数值内部用管道符 '|' 连接

### 语义映射示例
| 用户表述 | 对应参数 |
|--------|--------|
| 高分/好片 | \`vote_average.gte\`: 7.5, \`vote_count.gte\`: 100, \`sort_by\`: "vote_average.desc" |
| 热门/最火 | \`sort_by\`: "popularity.desc" |
| 最新 | \`sort_by\`: "primary_release_date.desc" |
| 短片/1小时以内 | \`with_runtime.lte\`: 60 |

### 重要规则
1. 数值必须能直接提取（如 '8分以上' → 8，'2小时' → 120分钟）
2. 无法识别的值返回空字符串
3. 所有数值参数必须是数字类型，不能包含文字
4. 日期格式必须是 YYYY-MM-DD
5. 语言代码必须是 ISO 639-1 标准代码
6. 如果用户提及具体的演员名、导演名或电影类型名，但无法确定其在TMDB中的ID，请放在 \`unresolved_entities\` 字段

## 输入信息

### 用户输入
\`\`\`
${userMessage}
\`\`\`

### 已知偏好
\`\`\`json
${existingPreferences}
\`\`\`

## 输出示例

对于输入"我想看一部评分在8分以上的科幻电影，英文原声，时长在2小时以内"：

\`\`\`json
{
  "genre": "科幻",
  "mood": "",
  "actors": "",
  "length": "2小时以内",
  "rating": "8分以上",
  "language": "英文",
  "scene": "",
  "theme": ""
}
\`\`\`
`;
  }

  /**
   * 监督智能体prompt - 整合搜索结果为最终答案
   */
  getSupervisorPrompt(
    userMessage: string,
    preferences: string,
    searchResult: string,
    imageUrl?: string,
    imageData?: boolean,
  ): string {
    return `# 监督智能体 - 结果整合

## 任务
将搜索结果整合为最终答案，提供给用户。

## 输出要求
输出必须是纯 JSON（不要包含多余注释或说明）。

## 输出字段

### 必填字段
- \`recommendations\` (数组) - 推荐电影列表，每项为推荐对象
- \`explanation\` (字符串) - 对整组推荐的总结性说明（为何匹配用户偏好）
- \`preferences\` (对象) - 规范化后的用户偏好（用于记录/回显/后续搜索）
- \`summary\` (字符串) - 缩略版本的总结，只保留未来对话可能有用的信息
  - 最多50字
  - 不要复述完整答案
  - 不要保留解释过程
  - 不要保留客套话
- \`topics\` (数组) - 讨论的主题列表，如 ["科幻", "推荐系统"]
- \`entities\` (数组) - 具体的人/项目/技术/产品等实体名称，如 ["电影", "科幻"]

### 推荐对象字段
\`\`\`json
{
  "name": "电影名",
  "title": "英文名",
  "reason": "推荐理由",
  "summary": "简短介绍",
  "overview": "完整描述",
  "poster_url": "海报URL",
  "backdrop_url": "背景图URL",
  "tmdb_url": "TMDB页面URL",
  "id": 12345,
  "release_date": "2023-01-01",
  "vote_average": 8.5,
  "vote_count": 1000,
  "genre_ids": [28, 12],
  "original_language": "en",
  "original_title": "Original Title",
  "adult": false,
  "video": false
}
\`\`\`

### 降级方案
仅在无法生成推荐时，使用 \`fallback_reason\` 字段说明原因。

## 输入信息

### 用户输入
\`\`\`
${userMessage}
\`\`\`

${imageUrl ? `### 图片链接\n\`\`\`\n${imageUrl}\n\`\`\`` : ""}
${imageData ? "\n### 图片数据\n附带已上传图片分析。" : ""}

### 用户偏好
\`\`\`json
${preferences}
\`\`\`

### 搜索结果
\`\`\`json
${searchResult}
\`\`\`

## 输出示例

\`\`\`json
{
  "recommendations": [
    {
      "name": "盗梦空间",
      "reason": "紧张且富有想象力",
      "summary": "一支入侵梦境的团队执行高风险任务...",
      "poster_url": "https://image.tmdb.org/t/p/w500/xxx.jpg",
      "tmdb_url": "https://www.themoviedb.org/movie/27205",
      "id": 27205,
      "release_date": "2010-07-16",
      "vote_average": 8.8,
      "vote_count": 31000
    }
  ],
  "explanation": "基于你偏好科幻与心理悬疑，推荐了以下高评分影片...",
  "preferences": {
    "genre": "科幻",
    "mood": "紧张刺激"
  },
  "summary": "推荐了2部高评分科幻电影",
  "topics": ["科幻", "推荐系统"],
  "entities": ["盗梦空间", "电影"]
}
\`\`\`
`;
  }

  /**
   * 意图识别prompt
   */
  getIntentClassificationPrompt(
    userMessage: string,
    conversationHistory?: string,
  ): string {
    return `# 意图识别

## 任务
判断用户查询是否与电影、演员相关。

## 输出要求
返回一个 JSON 对象，包含：
- \`type\` (string) - "in_scope" 或 "out_of_scope"
- \`confidence\` (number) - 置信度 0-1
- \`reason\` (string，可选) - 不在范围内的原因

## 范围内的查询类型

✅ 电影推荐和搜索
✅ 电影基本信息（上映年份、评分等）
✅ 演员/导演信息
✅ 电影类型和风格讨论
✅ 观影建议

## 范围外的查询类型

❌ 与电影无关的通用问题
❌ 其他领域的专业咨询
❌ 非电影内容的讨论

## 输入信息

### 用户消息
\`\`\`
${userMessage}
\`\`\`

${
  conversationHistory
    ? `### 对话历史\n\`\`\`\n${conversationHistory}\n\`\`\``
    : ""
}

## 输出示例

在范围内：
\`\`\`json
{
  "type": "in_scope",
  "confidence": 0.95
}
\`\`\`

不在范围内：
\`\`\`json
{
  "type": "out_of_scope",
  "confidence": 0.9,
  "reason": "这个查询与电影和演员无关"
}
\`\`\`
`;
  }
}
