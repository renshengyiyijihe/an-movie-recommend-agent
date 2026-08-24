/**
 * 任务规划的校验与收口。
 *
 * 规划模型只打这一次，产出 `TaskPlan`。`agents` 非法才抛错触发重试；
 * `relation` 缺字段、strategy 本轮做不了，一律收成 search，不要让整轮推荐失败。
 */
import { z } from "zod";
import { RELATION_CONSTANTS } from "./constants";
import { asRecord } from "./helpers";
import {
  AGENT_TYPE,
  AGENT_TYPES,
  AgentType,
  RELATION_ENTITY_TYPE,
  RELATION_ENTITY_TYPES,
  RELATION_OPERATIONS,
  RELATION_ROLES,
  RELATION_STRATEGIES,
  RELATION_STRATEGY,
  RelationPlan,
  TaskPlan,
  VIEW_ANSWER,
  VIEW_ANSWER_KINDS,
} from "./types";

/**
 * 规划 JSON 里 `relation` 对象的 Zod 约束，字段含义与 `RelationPlan` 一致。
 *
 * - strategy：discover=一次 movie_discover；compute=在工作副本上交/并/差；unsupported=本轮不跑 Relation。
 * - entities：用户说法里的人或片，最多 {@link RELATION_CONSTANTS.MAX_ENTITIES} 个。
 * - role：cast 主演，crew 导演/职员，any 或不写则不限职务。
 * - filters：能下推给 discover 或 compute 之后按片名排除。
 * - operation：compute 用的集合运算，缺省视为 intersect。
 * - answer：汇总应按片单、人物列表还是事实题来写。
 * - view：贵的字段开关；未写则不要把传记和整表作品塞进 prompt。
 */
const relationPlanSchema = z.object({
  /** @see RelationStrategy */
  strategy: z.enum(RELATION_STRATEGIES),
  entities: z
    .array(
      z.object({
        /** 用户原话或历史里的称呼，如「小李子」 */
        name: z.string().trim().min(1),
        /** person 人物，movie 影片 */
        type: z.enum(RELATION_ENTITY_TYPES),
        /** 省略或 any 表示不限职务 */
        role: z.enum(RELATION_ROLES).optional(),
      }),
    )
    .max(RELATION_CONSTANTS.MAX_ENTITIES),
  filters: z
    .object({
      /** 中文类型名，与 movie_discover.with_genres 相同 */
      genres: z.array(z.string().trim().min(1)).max(4).optional(),
      /** 主要上映年份，对应 primary_release_year */
      year: z.number().int().min(1900).max(2100).optional(),
      /** 最低平均评分 0–10 */
      voteAverageGte: z.number().min(0).max(10).optional(),
      /** 按片名包含关系排除，不再打一轮模型去解析 id */
      excludeMovieNames: z.array(z.string().trim().min(1)).max(5).optional(),
    })
    .optional(),
  /** 缺省时执行器按 intersect 处理 */
  operation: z.enum(RELATION_OPERATIONS).optional(),
  /** movies 片单，people 人物列表，fact 是否出演等判断 */
  answer: z.enum(VIEW_ANSWER_KINDS),
  view: z
    .object({
      /** 是否把人物作品表带进视图，默认否 */
      includeCredits: z.boolean().optional(),
      /** 作品表最多带几条，上限 8 */
      creditLimit: z.number().int().min(1).max(8).optional(),
      /** 是否带截断后的传记，默认否 */
      includeBiography: z.boolean().optional(),
    })
    .optional(),
});

/**
 * 解析规划模型输出，收成单一 Agent。
 *
 * - `agents` 不是 search/relation 数组：抛错，交给 `executeWithRetry`。
 * - 未点名 relation，或 relation 校验失败、本轮执行不了：只跑 Search。
 * - relation 可用：只跑 Relation，不再同时跑 Search。
 *
 * @param value `tryParseJson` 之后的对象
 * @returns 编排层可直接写入 `shared.plan` / `shared.relationPlan` 的结果
 */
export function parseTaskPlan(value: unknown): TaskPlan {
  const record = asRecord(value);
  if (!record) {
    throw new Error("模型返回的任务规划不是有效对象");
  }

  const agents = readAgents(record.agents);
  if (agents.length === 0) {
    throw new Error("模型返回了空的或无效的Agent计划");
  }

  const wantsRelation = agents.includes(AGENT_TYPE.RELATION);
  if (!wantsRelation) {
    return { agents: [AGENT_TYPE.SEARCH] };
  }

  const parsedRelation = relationPlanSchema.safeParse(record.relation);
  if (!parsedRelation.success) {
    return { agents: [AGENT_TYPE.SEARCH] };
  }

  const relation = parsedRelation.data;
  if (!isUsableRelationPlan(relation)) {
    return { agents: [AGENT_TYPE.SEARCH] };
  }

  return { agents: [AGENT_TYPE.RELATION], relation };
}

/**
 * 判断关系计划本轮是否真能执行。通过了仍可能在取数时失败，那时由编排层回退 Search。
 *
 * @param plan 已通过 Zod 的计划
 * @returns true 表示 RelationAgent 可以按该计划跑
 */
export function isUsableRelationPlan(plan: RelationPlan): boolean {
  if (plan.strategy === RELATION_STRATEGY.UNSUPPORTED) return false;
  if (plan.entities.length === 0) return false;
  const people = plan.entities.filter(
    (entity) => entity.type === RELATION_ENTITY_TYPE.PERSON,
  );
  const movies = plan.entities.filter(
    (entity) => entity.type === RELATION_ENTITY_TYPE.MOVIE,
  );

  if (plan.strategy === RELATION_STRATEGY.DISCOVER) {
    return people.length > 0;
  }
  if (plan.answer === VIEW_ANSWER.FACT) {
    return people.length === 1 && movies.length === 1;
  }
  return (
    (people.length >= 2 && movies.length === 0) ||
    (people.length === 0 && movies.length >= 2)
  );
}

/**
 * 读取 `agents` 数组，去重且只保留已注册的 Agent 名。
 *
 * @param value 规划 JSON 的 agents 字段
 * @returns 合法 Agent 列表；非法或空则返回空数组，由调用方决定抛错还是回退
 */
function readAgents(value: unknown): AgentType[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (!value.every((item) => isAgentType(item))) return [];
  return Array.from(new Set(value));
}

/**
 * @param value 任意值
 * @returns 是否为 `AGENT_TYPES` 中的字符串
 */
function isAgentType(value: unknown): value is AgentType {
  return (
    typeof value === "string" &&
    (AGENT_TYPES as readonly string[]).includes(value)
  );
}
