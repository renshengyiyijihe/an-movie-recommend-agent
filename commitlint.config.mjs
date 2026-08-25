/**
 * husky `commit-msg` 允许的 Conventional Commits type。
 * 格式：`type(scope): subject`，例如 `feat: 增加会话列表`。
 */
const COMMIT_TYPES = [
  "feat", // 新功能
  "fix", // 缺陷修复
  "docs", // 文档
  "style", // 格式（不影响逻辑）
  "refactor", // 重构
  "perf", // 性能
  "test", // 测试
  "build", // 构建 / 依赖
  "ci", // CI 配置
  "chore", // 杂项（不改业务代码）
  "revert", // 回滚
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", COMMIT_TYPES],
  },
};
