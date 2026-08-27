import { Injectable, Logger } from "@nestjs/common";
import { RELATION_CONSTANTS } from "../constants";
import {
  asArray,
  asRecord,
  getStringValue,
  normalizeText,
  readFiniteNumber,
  uniqueIds,
  yearFromReleaseDate,
} from "../helpers";
import {
  AGENT_TYPE,
  CompatibleModel,
  RELATION_ENTITY_TYPE,
  RELATION_OPERATION,
  RELATION_ROLE,
  RELATION_STRATEGY,
  RelationFilters,
  RelationOperation,
  RelationPlan,
  RelationRole,
  ResolvedEntity,
  TOOL_NAME,
  ToolName,
  VIEW_ANSWER,
} from "../types";
import {
  buildEvidenceView,
  MovieRecord,
  PersonCreditRecord,
  PersonRecord,
  toToolEventOutput,
  viewSpecFromRelationPlan,
} from "../working-set";
import { ToolsRegistry } from "./tools/tools.registry";
import { AgentRuntime, RelationPrivateState } from "./workflow-context";
import { isAbortError } from "../errors/workflow-cancelled.error";

/**
 * Relation Agent
 * 按规划执行跨实体取数与集合运算，不另调模型。
 * 完整数据进 workspace，publish 只给精简视图。
 */
@Injectable()
export class RelationAgent {
  private readonly logger = new Logger(RelationAgent.name);

  constructor(private readonly toolsRegistry: ToolsRegistry) {}

  /**
   * Orchestrator 入口。`model` 保留以对齐 Agent 签名，本轮不使用。
   */
  async execute(
    _model: CompatibleModel,
    runtime: AgentRuntime<RelationPrivateState>,
  ): Promise<void> {
    const plan = runtime.shared.relationPlan;
    if (!plan || plan.strategy === RELATION_STRATEGY.UNSUPPORTED) {
      runtime.local.error = "no_usable_plan";
        runtime.publish({
          success: false,
        result: JSON.stringify({ error: "no_usable_plan" }),
        });
        return;
      }

      this.logger.log(
      `[RelationAgent] strategy=${plan.strategy} entities=${plan.entities
        .map((entity) => entity.name)
        .join(",")}`,
    );

    try {
      const resolved = await this.resolveEntities(
        plan.entities,
        runtime,
        plan.filters?.year,
      );
      runtime.local.resolved = resolved;

      if (plan.strategy === RELATION_STRATEGY.DISCOVER) {
        await this.executeDiscover(plan, resolved, runtime);
      } else {
        await this.executeCompute(plan, resolved, runtime);
      }

      const view = buildEvidenceView(
        runtime.workspace,
        viewSpecFromRelationPlan(plan),
        {
          movieIds: runtime.workspace.getMovieIds(AGENT_TYPE.RELATION),
          personIds: this.focusPersonIds(plan, resolved, runtime),
        },
      );
      runtime.publish({
        success: true,
        result: JSON.stringify(view),
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[RelationAgent] ${message}`);
      runtime.local.error = message;
      runtime.publish({
        success: false,
        result: JSON.stringify({ error: message }),
      });
    }
  }

  /**
   * 将规划中的名字解析为 TMDB id。任一个失败则整轮失败，由编排层回退 search。
   */
  private async resolveEntities(
    entities: RelationPlan["entities"],
    runtime: AgentRuntime<RelationPrivateState>,
    year?: number,
  ): Promise<ResolvedEntity[]> {
    const resolved: ResolvedEntity[] = [];
    for (const entity of entities.slice(0, RELATION_CONSTANTS.MAX_ENTITIES)) {
      const role = entity.role ?? RELATION_ROLE.ANY;
      if (entity.type === RELATION_ENTITY_TYPE.PERSON) {
        const data = asRecord(
          await this.callTool(runtime, TOOL_NAME.PERSON_SEARCH, { query: entity.name }),
        );
        const id = pickResolvedId(
          asArray(data?.results),
          entity.name,
          RELATION_ENTITY_TYPE.PERSON,
        );
        resolved.push({
          mention: entity.name,
          type: RELATION_ENTITY_TYPE.PERSON,
          role,
          id,
        });
        continue;
      }

      const data = asRecord(
        await this.callTool(runtime, TOOL_NAME.MOVIE_SEARCH, {
          query: entity.name,
          year: year !== undefined ? String(year) : undefined,
        }),
      );
      const id = pickResolvedId(
        asArray(data?.results),
        entity.name,
        RELATION_ENTITY_TYPE.MOVIE,
        year,
      );
      resolved.push({
        mention: entity.name,
        type: RELATION_ENTITY_TYPE.MOVIE,
        role,
        id,
      });
    }
    return resolved;
  }

  /**
   * 人 + 类型/年份/评分等条件，一次 movie_discover。
   */
  private async executeDiscover(
    plan: RelationPlan,
    resolved: ResolvedEntity[],
    runtime: AgentRuntime<RelationPrivateState>,
  ): Promise<void> {
    const people = resolved.filter((entity) => entity.type === RELATION_ENTITY_TYPE.PERSON);
    if (people.length === 0) {
      throw new Error("discover 策略需要至少一个人名");
    }

    const input: Record<string, unknown> = {
      max_results: RELATION_CONSTANTS.DISCOVER_MAX_RESULTS,
      with_cast: joinIds(idsForRole(people, RELATION_ROLE.CAST)),
      with_crew: joinIds(idsForRole(people, RELATION_ROLE.CREW)),
      with_people: joinIds(idsForRole(people, RELATION_ROLE.ANY)),
    };
    applyDiscoverFilters(input, plan.filters);

    const data = asRecord(
      await this.callTool(runtime, TOOL_NAME.MOVIE_DISCOVER, input),
    );
    const movieIds = asArray(data?.results)
      .map((item) => {
        const row = asRecord(item);
        return readFiniteNumber(row?.movie_id ?? row?.id);
      })
      .filter((id): id is number => id !== undefined);

    runtime.workspace.addMovieList(
      AGENT_TYPE.RELATION,
      excludeMovies(movieIds, runtime, plan.filters?.excludeMovieNames),
    );
  }

  /**
   * 拉作品表 / 演职员表，在工作副本上做交、并、差或出演判定。
   */
  private async executeCompute(
    plan: RelationPlan,
    resolved: ResolvedEntity[],
    runtime: AgentRuntime<RelationPrivateState>,
  ): Promise<void> {
    const people = resolved.filter((entity) => entity.type === RELATION_ENTITY_TYPE.PERSON);
    const movies = resolved.filter((entity) => entity.type === RELATION_ENTITY_TYPE.MOVIE);
    const operation = plan.operation ?? RELATION_OPERATION.INTERSECT;

    for (const person of people) {
      const record = runtime.workspace.getPerson(person.id);
      if (record?.credits.length) continue;
      await this.callTool(runtime, TOOL_NAME.PERSON_DETAIL, {
        person_id: person.id,
        append_to_response: "movie_credits",
      });
    }

    for (const movie of movies) {
      const record = runtime.workspace.getMovie(movie.id);
      if (record && (record.cast.length || record.crew.length)) continue;
      await this.callTool(runtime, TOOL_NAME.MOVIE_DETAIL, {
        movie_id: movie.id,
        append_to_response: "credits",
      });
    }

    if (people.length >= 2 && movies.length === 0) {
      const sets = people.map((person) =>
        creditMovieIds(runtime.workspace.getPerson(person.id), person.role),
      );
      const combined = excludeMovies(
        combineIdSets(sets, operation),
        runtime,
        plan.filters?.excludeMovieNames,
      );
      runtime.workspace.addMovieList(AGENT_TYPE.RELATION, combined);
      return;
    }

    if (movies.length >= 2 && people.length === 0) {
      this.rememberMoviePeople(movies, runtime);
      const sets = movies.map((movie) =>
        moviePersonIds(runtime.workspace.getMovie(movie.id), movie.role),
      );
      runtime.workspace.addPersonList(
        AGENT_TYPE.RELATION,
        combineIdSets(sets, operation),
      );
      return;
    }

    if (people.length === 1 && movies.length === 1) {
      const person = runtime.workspace.getPerson(people[0].id);
      const movie = runtime.workspace.getMovie(movies[0].id);
      const matched = isPersonOnMovie(person, movie, people[0].role);
      runtime.workspace.addMovieList(
        AGENT_TYPE.RELATION,
        matched && movie ? [movie.id] : [],
      );
      return;
    }

    throw new Error("当前实体组合不受理");
  }

  /**
   * 把影片演职员写进人物表，便于共同演员视图带上姓名。
   */
  private rememberMoviePeople(
    movies: ResolvedEntity[],
    runtime: AgentRuntime<RelationPrivateState>,
  ): void {
    for (const movie of movies) {
      const record = runtime.workspace.getMovie(movie.id);
      if (!record) continue;
      for (const credit of creditsOnMovie(record, RELATION_ROLE.ANY)) {
        runtime.workspace.upsertPerson({
          id: credit.personId,
          name: credit.name,
          credits: [],
        });
      }
    }
  }

  /**
   * 视图里要带的人物：答案是人则用计算结果，否则用已解析的人。
   */
  private focusPersonIds(
    plan: RelationPlan,
    resolved: ResolvedEntity[],
    runtime: AgentRuntime<RelationPrivateState>,
  ): number[] {
    if (plan.answer === VIEW_ANSWER.PEOPLE) {
      const computed = runtime.workspace.getPersonIds(AGENT_TYPE.RELATION);
      if (computed.length) return computed;
    }
    return resolved
      .filter((entity) => entity.type === RELATION_ENTITY_TYPE.PERSON)
      .map((entity) => entity.id);
  }

  /**
   * 执行已注册工具，成功则写入工作副本并记一条瘦事件。
   */
  private async callTool(
    runtime: AgentRuntime<RelationPrivateState>,
    toolName: ToolName,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const output = await this.toolsRegistry.execute(toolName, input);
    runtime.workspace.ingestToolData(toolName, output.data);
    await runtime.record({
      kind: "tool_call",
      actor: AGENT_TYPE.RELATION,
      tool_name: toolName,
      input,
      output: toToolEventOutput(output),
    });
    if (output.success === false) {
      throw new Error(output.error || `${toolName} 执行失败`);
    }
    return output.data;
  }
}

/**
 * 按职务从人物作品表取出影片 id。
 * @param person 工作副本中的人物
 * @param role 规划给出的职务
 */
function creditMovieIds(
  person: PersonRecord | undefined,
  role: RelationRole,
): number[] {
  if (!person) return [];
  return uniqueIds(
    person.credits
      .filter((credit) => matchesRole(credit, role))
      .map((credit) => credit.movieId),
  );
}

/**
 * 按职务从影片演职员表取出人物 id。未指定职务时默认取主演，对应「共同演员」。
 */
function moviePersonIds(
  movie: MovieRecord | undefined,
  role: RelationRole,
): number[] {
  if (!movie) return [];
  return uniqueIds(creditsOnMovie(movie, role).map((item) => item.personId));
}

/**
 * 影片上与职务对应的演职员表。新职务补这一处即可。
 */
function creditsOnMovie(movie: MovieRecord, role: RelationRole) {
  const byRole = {
    [RELATION_ROLE.CAST]: movie.cast,
    [RELATION_ROLE.CREW]: movie.crew,
    [RELATION_ROLE.ANY]: [...movie.cast, ...movie.crew],
  } satisfies Record<RelationRole, typeof movie.cast>;
  return byRole[role];
}

function matchesRole(credit: PersonCreditRecord, role: RelationRole): boolean {
  if (role === RELATION_ROLE.ANY) return true;
  if (role === RELATION_ROLE.CAST) return Boolean(credit.character) || !credit.job;
  return Boolean(credit.job) || Boolean(credit.department);
}

/**
 * 某人是否以指定职务出现在某部片里。人物作品表和影片演职员表任一侧命中即可。
 * @param person 工作副本中的人物
 * @param movie 工作副本中的影片
 * @param role 规划给出的职务
 * @example
 * person `{ id: 31, credits: [{ movieId: 13, character: "Forrest" }] }`
 * movie `{ id: 13, cast: [], crew: [] }`
 * role = CAST
 * → true
 */
function isPersonOnMovie(
  person: PersonRecord | undefined,
  movie: MovieRecord | undefined,
  role: RelationRole,
): boolean {
  if (!person || !movie) return false;
  return (
    creditMovieIds(person, role).includes(movie.id) ||
    moviePersonIds(movie, role).includes(person.id)
  );
}

function combineIdSets(sets: number[][], operation: RelationOperation): number[] {
  if (sets.length === 0) return [];
  const typed = sets.map((item) => new Set(item));
  if (operation === RELATION_OPERATION.UNION) {
    const union = new Set<number>();
    for (const item of typed) {
      for (const id of item) union.add(id);
    }
    return [...union];
  }
  if (operation === RELATION_OPERATION.DIFFERENCE) {
    const [head, ...rest] = typed;
    const remaining = new Set(head);
    for (const item of rest) {
      for (const id of item) remaining.delete(id);
    }
    return [...remaining];
  }
  return [
    ...typed.reduce((left, right) => {
      return new Set([...left].filter((id) => right.has(id)));
    }),
  ];
}

function applyDiscoverFilters(
  input: Record<string, unknown>,
  filters: RelationFilters | undefined,
): void {
  if (!filters) return;
  if (filters.genres?.length) input.with_genres = filters.genres;
  if (filters.year !== undefined) input.primary_release_year = filters.year;
  if (filters.voteAverageGte !== undefined) {
    input.vote_average_gte = filters.voteAverageGte;
  }
}

function excludeMovies(
  movieIds: number[],
  runtime: AgentRuntime<RelationPrivateState>,
  names?: string[],
): number[] {
  if (!names?.length) return movieIds;
  const needles = names.map((name) => name.toLowerCase());
  return movieIds.filter((id) => {
    const view = runtime.workspace.toMovieView(id);
    if (!view) return true;
    const title = view.name.toLowerCase();
    return !needles.some((name) => title.includes(name));
  });
}

function idsForRole(people: ResolvedEntity[], role: RelationRole): number[] {
  return people.filter((person) => person.role === role).map((person) => person.id);
}

function joinIds(ids: number[]): string | undefined {
  return ids.length ? ids.join(",") : undefined;
}

/**
 * 从搜索结果里挑一个 TMDB id。精确名优先，其次年份，再比热度；无法唯一确定则失败。
 * @param results person_search / movie_search 的 results
 * @param mention 规划里的称呼
 * @param kind person 或 movie
 * @param year 影片可选上映年
 * @returns 选中的 id
 * @example
 * `[{ movie_id: 27205, title: "盗梦空间", popularity: 80 }, { movie_id: 9, title: "盗梦空间：前传", popularity: 10 }]`
 * + `"盗梦空间"` → `27205`
 *
 * `[{ person_id: 1, name: "张伟", popularity: 1.2 }, { person_id: 2, name: "张伟", popularity: 1.1 }]`
 * + `"张伟"` → 抛「无法唯一解析人物: 张伟」
 */
function pickResolvedId(
  results: unknown[],
  mention: string,
  kind:
    | typeof RELATION_ENTITY_TYPE.PERSON
    | typeof RELATION_ENTITY_TYPE.MOVIE,
  year?: number,
): number {
  const label = kind === RELATION_ENTITY_TYPE.PERSON ? "人物" : "影片";
  let rows = results
    .map((item) => asRecord(item))
    .filter((row): row is Record<string, unknown> => Boolean(row));

  if (year !== undefined && kind === RELATION_ENTITY_TYPE.MOVIE) {
    const yearRows = rows.filter(
      (row) => yearFromReleaseDate(getStringValue(row.release_date)) === String(year),
    );
    if (yearRows.length === 1) return requireEntityId(yearRows[0], kind, mention);
    if (yearRows.length > 1) rows = yearRows;
  }

  const needle = normalizeText(mention).toLowerCase();
  const exact = rows.filter((row) => entityNames(row).includes(needle));
  const pool = exact.length > 0 ? exact : rows;
  if (pool.length === 0) {
    throw new Error(`无法解析${label}: ${mention}`);
  }
  if (pool.length === 1) {
    return requireEntityId(pool[0], kind, mention);
  }

  const ranked = [...pool].sort(
    (left, right) => entityPopularity(right) - entityPopularity(left),
  );
  const top = entityPopularity(ranked[0]);
  const second = entityPopularity(ranked[1]);
  if (top > 0 && top >= second * 3) {
    return requireEntityId(ranked[0], kind, mention);
  }
  throw new Error(`无法唯一解析${label}: ${mention}`);
}

function entityNames(row: Record<string, unknown>): string[] {
  return [row.name, row.title, row.original_title, row.original_name]
    .map((value) => normalizeText(getStringValue(value)).toLowerCase())
    .filter(Boolean);
}

function entityPopularity(row: Record<string, unknown>): number {
  return readFiniteNumber(row.popularity) ?? 0;
}

function requireEntityId(
  row: Record<string, unknown>,
  kind:
    | typeof RELATION_ENTITY_TYPE.PERSON
    | typeof RELATION_ENTITY_TYPE.MOVIE,
  mention: string,
): number {
  const id = readFiniteNumber(
    kind === RELATION_ENTITY_TYPE.PERSON
      ? (row.person_id ?? row.id)
      : (row.movie_id ?? row.id),
  );
  if (id === undefined || id <= 0) {
    const label = kind === RELATION_ENTITY_TYPE.PERSON ? "人物" : "影片";
    throw new Error(`无法解析${label}: ${mention}`);
  }
  return id;
}
