export const commonToolSchema = {
  language: {
    type: "string",
    description:
      "返回内容的语言。遵循 IETF language tag 格式，通常为 ISO 639-1 两位语言代码 + ISO 3166-1 alpha-2 两位地区代码，例如 'zh-CN'、'zh-TW'、'en-US'、'en-GB'。默认使用 'zh-CN'。",
  },
  include_adult: {
    type: "boolean",
    description: "是否包含成人内容，默认为 false",
  },
  page: {
    type: "integer",
    description: "指定获取的结果页码，默认为 1",
  },
  max_results: {
    type: "integer",
    description:
      "返回条数上限。默认 3，最大 20。只影响工具返回给工作副本的列表长度，不代表会全部进入模型。",
  },
} as const;
