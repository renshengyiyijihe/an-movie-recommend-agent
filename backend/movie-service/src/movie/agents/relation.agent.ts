import { Injectable, Logger } from "@nestjs/common";
import { SearchAgent } from "./search.agent";
import {
  CompatibleModel,
  RelationAgentResult,
  RelationshipType,
  SearchAgentResult,
} from "../types";

/**
 * Relation Agent - 关系代理
 * 负责处理跨实体逻辑、多条件求交集、关联关系等复杂问题
 * 示例：
 *   - "小李子和诺兰合作过哪些电影"
 *   - "演过李安电影最多的演员是谁"
 */
@Injectable()
export class RelationAgent {
  private readonly logger = new Logger(RelationAgent.name);

  constructor(
    private readonly searchAgent: SearchAgent,
  ) {}

  /**
   * 执行关系推理任务
   * @param model LLM模型
   * @param query 用户查询
   * @param conversationHistory 对话历史
   */
  async execute(
    model: CompatibleModel,
    query: string,
    conversationHistory?: string,
  ): Promise<RelationAgentResult> {
    this.logger.log(`[RelationAgent] Executing relation reasoning: query=${query}`);

    try {
      // 分析查询以识别涉及的实体和关系类型
      const analysis = await this.analyzeRelationQuery(model, query);
      
      if (!analysis.success) {
        return {
          success: false,
          result: analysis.error || "无法分析查询",
          entities_involved: [],
          relationship_type: "unknown",
          error: analysis.error,
        };
      }

      this.logger.log(
        `[RelationAgent] Analysis complete: entities=${JSON.stringify(analysis.entities)}, relationship=${analysis.relationship}`,
      );

      // 根据关系类型调用SearchAgent获取必要数据
      const searchResults = await this.gatherRelationData(
        model,
        analysis.entities,
        analysis.relationship,
      );

      if (!searchResults.success) {
        return {
          success: false,
          result: `数据收集失败: ${searchResults.error}`,
          entities_involved: analysis.entities,
          relationship_type: analysis.relationship,
          error: searchResults.error,
        };
      }

      // 使用LLM执行跨实体逻辑运算
      const relationResult = await this.processRelation(
        model,
        query,
        analysis.entities,
        analysis.relationship,
        searchResults,
        conversationHistory,
      );

      return {
        success: true,
        result: relationResult,
        entities_involved: analysis.entities,
        relationship_type: analysis.relationship,
      };
    } catch (error) {
      this.logger.error(`[RelationAgent] Error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        result: `关系推理失败: ${error instanceof Error ? error.message : "未知错误"}`,
        entities_involved: [],
        relationship_type: "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 分析关系查询以识别实体和关系类型
   */
  private async analyzeRelationQuery(
    model: CompatibleModel,
    query: string,
  ): Promise<{
    success: boolean;
    entities: string[];
    relationship: RelationshipType;
    error?: string;
  }> {
    try {
      // TODO: 使用LLM来解析查询并识别实体和关系
      // 当前返回简单的启发式分析
      
      const lowerQuery = query.toLowerCase();
      let relationship: RelationshipType = "unknown";
      const entities: string[] = [];

      // 简单的关键字匹配
      if (lowerQuery.includes("合作") || lowerQuery.includes("collaborated")) {
        relationship = "collaboration";
      } else if (lowerQuery.includes("演过") || lowerQuery.includes("acted")) {
        relationship = "acted_in";
      } else if (lowerQuery.includes("导演") || lowerQuery.includes("directed")) {
        relationship = "directed";
      } else if (lowerQuery.includes("最多") || lowerQuery.includes("most")) {
        relationship = "ranking";
      }

      // TODO: 使用NER或其他技术从查询中提取实体名称
      
      return {
        success: true,
        entities,
        relationship,
      };
    } catch (error) {
      return {
        success: false,
        entities: [],
        relationship: "unknown",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 收集关系数据
   * 根据实体和关系类型，调用SearchAgent获取必要的信息
   */
  private async gatherRelationData(
    model: CompatibleModel,
    entities: string[],
    relationship: RelationshipType,
  ): Promise<SearchAgentResult> {
    this.logger.log(
      `[RelationAgent] Gathering relation data: entities=${entities}, relationship=${relationship}`,
    );

    // 为每个实体调用SearchAgent获取相关信息
    const allSearchResults = [];
    
    for (const entity of entities) {
      let searchQuery = "";
      
      if (relationship === "collaboration") {
        searchQuery = `${entity} 作品`;
      } else if (relationship === "acted_in") {
        searchQuery = `${entity} 演过的电影`;
      } else if (relationship === "directed") {
        searchQuery = `${entity} 导演的电影`;
      } else {
        searchQuery = entity;
      }

      const result = await this.searchAgent.execute(model, searchQuery);
      allSearchResults.push({
        entity,
        result,
      });
    }

    // 合并结果
    return {
      success: true,
      result: JSON.stringify(allSearchResults),
      tool_calls: [],
    };
  }

  /**
   * 处理关系逻辑（交集、排序等）
   */
  private async processRelation(
    model: CompatibleModel,
    query: string,
    entities: string[],
    relationship: RelationshipType,
    searchResults: SearchAgentResult,
    conversationHistory?: string,
  ): Promise<string> {
    // TODO: 使用LLM执行复杂的关系逻辑运算
    // - 求交集（两个演员的合作作品）
    // - 排序/排名（某演员在特定导演作品中的频率最高）
    // - 链式推理
    
    return `关系处理结果 (实体: ${entities.join(", ")}, 关系类型: ${relationship})`;
  }
}
