import { Injectable, Logger } from "@nestjs/common";

/**
 * 关系分析服务
 * 负责处理跨实体的复杂关系问题
 * 例如：两个演员的合作作品、某导演的常用演员等
 */
@Injectable()
export class RelationAnalysisService {
  private readonly logger = new Logger(RelationAnalysisService.name);

  /**
   * 分析查询中涉及的实体
   */
  extractEntitiesFromQuery(query: string): {
    entities: string[];
    types: string[];
  } {
    // TODO: 使用NER技术从查询中提取实体
    // 当前实现为placeholder
    this.logger.log(`Extracting entities from query: ${query}`);

    return {
      entities: [],
      types: [],
    };
  }

  /**
   * 识别关系类型
   */
  identifyRelationshipType(query: string): RelationshipType {
    const lowerQuery = query.toLowerCase();

    // 简单的关键字匹配
    if (
      lowerQuery.includes("合作") ||
      lowerQuery.includes("collaborated") ||
      lowerQuery.includes("一起")
    ) {
      return "collaboration";
    }

    if (
      lowerQuery.includes("演过") ||
      lowerQuery.includes("acted") ||
      lowerQuery.includes("主演")
    ) {
      return "acted_in";
    }

    if (
      lowerQuery.includes("导演") ||
      lowerQuery.includes("directed") ||
      lowerQuery.includes("执导")
    ) {
      return "directed";
    }

    if (
      lowerQuery.includes("最多") ||
      lowerQuery.includes("most") ||
      lowerQuery.includes("排名")
    ) {
      return "ranking";
    }

    return "unknown";
  }

  /**
   * 计算两个数据集的交集（用于合作电影等）
   */
  intersectDatasets<T extends Record<string, any>>(
    set1: T[],
    set2: T[],
    keyExtractor: (item: T) => string | number,
  ): T[] {
    const set2Keys = new Set(set2.map(keyExtractor));
    return set1.filter((item) => set2Keys.has(keyExtractor(item)));
  }

  /**
   * 排序和排名数据
   */
  rankAndSortData<T extends Record<string, any>>(
    data: T[],
    sortKey: keyof T,
    order: "asc" | "desc" = "desc",
  ): T[] {
    return data.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return order === "desc" ? bVal - aVal : aVal - bVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return order === "desc"
        ? bStr.localeCompare(aStr)
        : aStr.localeCompare(bStr);
    });
  }

  /**
   * 聚合数据（用于统计等）
   */
  aggregateData<T extends Record<string, any>>(
    data: T[],
    groupKey: keyof T,
  ): Map<any, T[]> {
    const result = new Map<any, T[]>();

    for (const item of data) {
      const key = item[groupKey];
      if (!result.has(key)) {
        result.set(key, []);
      }
      result.get(key)!.push(item);
    }

    return result;
  }

  /**
   * 构建关系查询的执行计划
   * 返回需要执行的查询序列
   */
  buildExecutionPlan(
    relationshipType: RelationshipType,
    entities: string[],
  ): RelationQueryStep[] {
    const steps: RelationQueryStep[] = [];

    switch (relationshipType) {
      case "collaboration":
        // 合作关系：先查询每个实体的作品，再求交集
        for (const entity of entities) {
          steps.push({
            type: "fetch_works",
            entity,
            description: `获取 ${entity} 的作品列表`,
          });
        }
        steps.push({
          type: "intersect",
          description: `计算各实体的共同作品`,
        });
        break;

      case "acted_in":
        // 演过：获取演员的作品列表
        for (const entity of entities) {
          steps.push({
            type: "fetch_actor_filmography",
            entity,
            description: `获取演员 ${entity} 的演过的电影列表`,
          });
        }
        steps.push({
          type: "filter_quality",
          description: `按热度或评分筛选`,
        });
        break;

      case "directed":
        // 导演过：获取导演的作品列表
        for (const entity of entities) {
          steps.push({
            type: "fetch_director_filmography",
            entity,
            description: `获取导演 ${entity} 的执导作品列表`,
          });
        }
        steps.push({
          type: "filter_quality",
          description: `按热度或评分筛选`,
        });
        break;

      case "ranking":
        // 排名/频率分析
        steps.push({
          type: "fetch_works",
          entity: entities[0],
          description: `获取 ${entities[0]} 的作品列表`,
        });
        steps.push({
          type: "analyze_frequency",
          description: `分析其他实体（如演员）在这些作品中的出现频率`,
        });
        steps.push({
          type: "rank",
          description: `按频率排序`,
        });
        break;

      default:
        break;
    }

    return steps;
  }

  /**
   * 格式化关系分析结果
   */
  formatRelationResult(
    relationshipType: RelationshipType,
    data: Record<string, any>[],
    entities: string[],
  ): string {
    switch (relationshipType) {
      case "collaboration":
        return this._formatCollaborationResult(data, entities);
      case "acted_in":
        return this._formatActedInResult(data, entities);
      case "directed":
        return this._formatDirectedResult(data, entities);
      case "ranking":
        return this._formatRankingResult(data, entities);
      default:
        return JSON.stringify(data);
    }
  }

  private _formatCollaborationResult(data: Record<string, any>[], entities: string[]): string {
    return `${entities.join(" 和 ")} 的合作作品：\n${data
      .map((m) => `- 《${m.title}》(${m.release_year}, 评分: ${m.vote_average}/10)`)
      .join("\n")}`;
  }

  private _formatActedInResult(data: Record<string, any>[], entities: string[]): string {
    return `${entities[0]} 的代表作：\n${data
      .map(
        (m) =>
          `- 《${m.title}》(${m.release_year}, 评分: ${m.vote_average}/10, 评论数: ${m.vote_count})`,
      )
      .join("\n")}`;
  }

  private _formatDirectedResult(data: Record<string, any>[], entities: string[]): string {
    return `${entities[0]} 执导的作品：\n${data
      .map(
        (m) =>
          `- 《${m.title}》(${m.release_year}, 评分: ${m.vote_average}/10, 评论数: ${m.vote_count})`,
      )
      .join("\n")}`;
  }

  private _formatRankingResult(data: Record<string, any>[], entities: string[]): string {
    return `排名结果：\n${data
      .slice(0, 10)
      .map((item, idx) => `${idx + 1}. ${item.name || item.title} (${item.count || item.frequency}次)`)
      .join("\n")}`;
  }
}

export type RelationshipType = "collaboration" | "acted_in" | "directed" | "ranking" | "unknown";

export interface RelationQueryStep {
  type: string;
  entity?: string;
  description: string;
}
