/**
 * Tool执行结果统一格式
 */
import { ToolName } from "../../types";

export interface ToolResult<T = any> {
  /** 执行是否成功 */
  success: boolean;
  /** 处理后的数据，用于LLM理解 */
  data: T;
  /** 原始数据，来自TMDB */
  raw_result?: any;
  /** 结构化数据，便于后续处理 */
  structured_data?: any;
  /** 元数据（如查询参数、时间戳等） */
  metadata?: Record<string, any>;
  /** 错误信息 */
  error?: string;
}

/**
 * Tool基础接口
 */
export interface ITool {
  /** 已注册工具名，取值见 `TOOL_NAME` */
  name: ToolName;
  /** Tool描述 */
  description: string;
  /** Tool的输入schema（用于LLM function calling） */
  schema: Record<string, any>;
  /** 执行Tool */
  execute(input: Record<string, any>): Promise<ToolResult>;
}
