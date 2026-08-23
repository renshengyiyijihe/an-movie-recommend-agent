/**
 * 本轮请求的工作副本：完整结构化数据只放这里，不进 prompt。
 * 挂在 WorkflowContext 上，请求结束随上下文释放，不写 Postgres。
 *
 * 加标量字段：改对应 Record 接口，并只在 `readPersonRecord` / `readMovieRecord`
 * 从 TMDB 行取值。`upsert*` 会合并有值标量，不必再手写赋值列表。
 * 只有需要去重合并的数组才放进 `PERSON_COLLECTIONS` / `MOVIE_COLLECTIONS`。
 */
import { assignWith, cloneDeep, compact, find, findLast, flatMap } from "lodash-es";
import { TMDB_CONSTANTS, VIEW_CONSTANTS } from "./constants";
import {
  ageFromBirthday,
  asArray,
  asRecord,
  getStringValue,
  readFiniteNumber,
  summarizeText,
  takeFirst,
  uniqueByLast,
  uniqueIds,
  yearFromReleaseDate,
} from "./helpers";
import {
  AGENT_TYPE,
  AgentEvidenceView,
  MovieViewItem,
  PersonViewItem,
  RelationPlan,
  TOOL_NAME,
  ViewSpec,
} from "./types";

/**
 * 人物在某部影片中的一条职务记录。
 */
export interface PersonCreditRecord {
  /** TMDB 影片 id */
  movieId: number;
  /** 片名 */
  title: string;
  /** 上映日期，YYYY-MM-DD 或空串 */
  releaseDate: string;
  /** 海报相对路径；没有则为 null */
  posterPath: string | null;
  /** 饰演角色；仅出演条目有 */
  character?: string;
  /** 职员职务，如 Director */
  job?: string;
  /** 职员部门，如 Directing */
  department?: string;
}

/**
 * 工作副本中的人物。credits 只挂在人物上，不自动铺进影片表。
 */
export interface PersonRecord {
  /** TMDB 人物 id */
  id: number;
  /** 姓名 */
  name: string;
  /** 生日 YYYY-MM-DD；未知则缺省 */
  birthday?: string | null;
  /** 出生地 */
  placeOfBirth?: string | null;
  /** TMDB 主职部门 */
  knownForDepartment?: string;
  /** 传记，入库时已截断 */
  biography?: string;
  /** 作品表（出演 + 职员） */
  credits: PersonCreditRecord[];
}

/**
 * 影片演职员中的一条人物。
 */
export interface MovieCreditPerson {
  /** TMDB 人物 id */
  personId: number;
  /** 姓名 */
  name: string;
  /** 饰演角色；仅出演条目有 */
  character?: string;
  /** 职员职务 */
  job?: string;
  /** 职员部门 */
  department?: string;
}

/**
 * 工作副本中的影片。cast / crew 仅在请求了 credits 时存在。
 */
export interface MovieRecord {
  /** TMDB 影片 id */
  id: number;
  /** 片名 */
  title: string;
  /** 上映日期，YYYY-MM-DD 或空串 */
  releaseDate: string;
  /** 海报相对路径；没有则为 null */
  posterPath: string | null;
  /** 剧情简介，入库时已截断 */
  overview?: string;
  /** TMDB 平均分 */
  voteAverage?: number;
  /** 出演名单 */
  cast: MovieCreditPerson[];
  /** 职员名单 */
  crew: MovieCreditPerson[];
}

/**
 * 人物上需要按 key 去重合并的集合字段。新标量不要加进来。
 */
const PERSON_COLLECTIONS = ["credits"] as const satisfies readonly (keyof PersonRecord)[];

/**
 * 影片上需要按 key 去重合并的集合字段。新标量不要加进来。
 */
const MOVIE_COLLECTIONS = ["cast", "crew"] as const satisfies readonly (keyof MovieRecord)[];

/**
 * 本轮内存工作副本。按 TMDB id 去重合并，禁止写入 raw_result。
 */
export class WorkingSet {
  /** 按 TMDB person id 索引 */
  private readonly people = new Map<number, PersonRecord>();
  /** 按 TMDB movie id 索引 */
  private readonly movies = new Map<number, MovieRecord>();
  /** 本轮产出的影片 id 列表，按写入顺序 */
  private readonly movieLists = new KeyedIdLists();
  /** 本轮产出的人物 id 列表，按写入顺序 */
  private readonly personLists = new KeyedIdLists();

  /**
   * 写入或合并人物。credits 按 movieId + job + character 去重，后写入覆盖。
   * @param incoming 待合并的人物
   */
  upsertPerson(incoming: PersonRecord): void {
    upsertIdentified(
      this.people,
      incoming,
      PERSON_COLLECTIONS,
      (current, next) => {
        current.credits = takeFirst(
          uniqueByLast(
            [...current.credits, ...next.credits],
            (item) => creditKey(item.movieId, item),
          ),
          TMDB_CONSTANTS.MAX_PERSON_CREDITS * 2,
        );
      },
    );
  }

  /**
   * 写入或合并影片。cast / crew 按 personId + job + character 去重，后写入覆盖。
   * @param incoming 待合并的影片
   */
  upsertMovie(incoming: MovieRecord): void {
    upsertIdentified(this.movies, incoming, MOVIE_COLLECTIONS, (current, next) => {
      current.cast = uniqueByLast(
        [...current.cast, ...next.cast],
        (item) => creditKey(item.personId, item),
      );
      current.crew = uniqueByLast(
        [...current.crew, ...next.crew],
        (item) => creditKey(item.personId, item),
      );
    });
  }

  /**
   * 记录一组影片 id，供视图按「最近一次列表」取数。
   * @param key 列表名，例如 search / relation
   * @param movieIds TMDB 影片 id
   */
  addMovieList(key: string, movieIds: number[]): void {
    this.movieLists.add(key, movieIds);
  }

  /**
   * 记录一组人物 id，供「共同演员」这类答案使用。
   * @param key 列表名
   * @param personIds TMDB 人物 id
   */
  addPersonList(key: string, personIds: number[]): void {
    this.personLists.add(key, personIds);
  }

  /**
   * @param id TMDB 人物 id
   * @returns 已入库的人物；没有则 undefined
   */
  getPerson(id: number): PersonRecord | undefined {
    return this.people.get(id);
  }

  /**
   * @param id TMDB 影片 id
   * @returns 已入库的影片；没有则 undefined
   */
  getMovie(id: number): MovieRecord | undefined {
    return this.movies.get(id);
  }

  /**
   * @returns 当前已解析的全部人物
   */
  listPeople(): PersonRecord[] {
    return [...this.people.values()];
  }

  /**
   * @returns 影片表中的全部 TMDB id（不含只存在于人物作品表里的条目）
   */
  listMovieIds(): number[] {
    return [...this.movies.keys()];
  }

  /**
   * @param key 列表名；不传则取最近一次影片列表
   * @returns 对应影片 id；没有则为空数组
   */
  getMovieIds(key?: string): number[] {
    return this.movieLists.get(key);
  }

  /**
   * @param key 列表名；不传则取最近一次人物列表
   * @returns 对应人物 id；没有则为空数组
   */
  getPersonIds(key?: string): number[] {
    return this.personLists.get(key);
  }

  /**
   * 将 Tool 的 `data` 写入工作副本。无法识别的结构直接忽略。
   * @param toolName 已注册工具名
   * @param data ToolResult.data
   */
  ingestToolData(toolName: string, data: unknown): void {
    const record = asRecord(data);
    if (!record) return;

    switch (toolName) {
      case TOOL_NAME.PERSON_SEARCH:
        this.ingestPersonSearch(record);
        return;
      case TOOL_NAME.MOVIE_SEARCH:
      case TOOL_NAME.MOVIE_DISCOVER:
        this.ingestMovieList(toolName, record);
        return;
      case TOOL_NAME.PERSON_DETAIL:
        this.ingestPersonDetail(record);
        return;
      case TOOL_NAME.MOVIE_DETAIL:
        this.ingestMovieDetail(record);
        return;
      default:
        return;
    }
  }

  /**
   * 按 id 生成影片视图。影片表没有时，回退到人物作品表里的同名记录。
   * @param movieId TMDB 影片 id
   * @returns 给汇总用的影片卡片；两边都没有则为 undefined
   */
  toMovieView(movieId: number): MovieViewItem | undefined {
    const movie = this.movies.get(movieId);
    if (movie) return movieRecordToView(movie);

    const credit = find(
      flatMap([...this.people.values()], (person) => person.credits),
      (item) => item.movieId === movieId,
    );
    return credit ? movieRecordToView(credit) : undefined;
  }

  /**
   * 按 id 生成人物视图。标量默认带上；传记与作品表由 spec 控制。
   * @param personId TMDB 人物 id
   * @param spec 本轮视图说明
   * @returns 给汇总用的人物卡片；未入库则为 undefined
   */
  toPersonView(personId: number, spec: ViewSpec): PersonViewItem | undefined {
    const person = this.people.get(personId);
    if (!person) return undefined;

    const item: PersonViewItem = {
      id: person.id,
      name: person.name,
    };
    const age = ageFromBirthday(person.birthday);
    if (age !== undefined) item.age = age;
    if (person.birthday) item.birthday = person.birthday;
    if (person.knownForDepartment) {
      item.known_for_department = person.knownForDepartment;
    }
    if (spec.includeBiography && person.biography) {
      item.biography = summarizeText(
        person.biography,
        VIEW_CONSTANTS.BIOGRAPHY_MAX_LENGTH,
      );
    }
    return item;
  }

  /**
   * 写入人物搜索列表，并顺带收录 known_for 里的影片 stub。
   * @param record Tool `data`
   */
  private ingestPersonSearch(record: Record<string, unknown>): void {
    const ids: number[] = [];
    for (const row of resultRows(record)) {
      const person = readPersonRecord(row);
      if (!person) continue;
      ids.push(person.id);
      this.upsertPerson(person);

      for (const known of compact(asArray(row.known_for).map(asRecord))) {
        const movie = readMovieRecord(known);
        if (movie) this.upsertMovie(movie);
      }
    }
    if (ids.length) this.addPersonList(AGENT_TYPE.SEARCH, ids);
  }

  /**
   * 写入影片搜索 / discover 列表。
   * @param listKey 列表名，通常是工具名
   * @param record Tool `data`
   */
  private ingestMovieList(
    listKey: string,
    record: Record<string, unknown>,
  ): void {
    const ids: number[] = [];
    for (const row of resultRows(record)) {
      const movie = readMovieRecord(row);
      if (!movie) continue;
      ids.push(movie.id);
      this.upsertMovie(movie);
    }
    if (ids.length) this.addMovieList(listKey, ids);
  }

  /**
   * 写入人物详情，含 movie_credits 的出演与职员。
   * @param record Tool `data`
   */
  private ingestPersonDetail(record: Record<string, unknown>): void {
    const creditsBlock = asRecord(record.movie_credits);
    const credits = readPersonCredits([
      ...asArray(creditsBlock?.cast),
      ...asArray(creditsBlock?.crew),
    ]);
    const person = readPersonRecord(record, {
      credits: takeFirst(credits, TMDB_CONSTANTS.MAX_PERSON_CREDITS * 2),
    });
    if (person) this.upsertPerson(person);
  }

  /**
   * 写入影片详情，含 credits 的出演与职员。
   * @param record Tool `data`
   */
  private ingestMovieDetail(record: Record<string, unknown>): void {
    const credits = asRecord(record.credits);
    const movie = readMovieRecord(record, {
      cast: takeFirst(
        readMovieCredits(asArray(credits?.cast)),
        TMDB_CONSTANTS.MAX_MOVIE_CAST,
      ),
      crew: takeFirst(
        readMovieCredits(asArray(credits?.crew)),
        TMDB_CONSTANTS.MAX_MOVIE_CREW,
      ),
    });
    if (movie) this.upsertMovie(movie);
  }
}

/**
 * 把规划里的 `relation.view` 摊成汇总用的投影开关。没写的开关保持 undefined，汇总侧按默认只带标量和片单。
 * @param plan 规划产物
 * @returns 给 `buildEvidenceView` 用的投影开关
 * @example
 * `{ answer: "people", view: { includeBiography: true, includeCredits: true, creditLimit: 5 } }`
 * → `{ answer: "people", includeCredits: true, creditLimit: 5, includeBiography: true }`
 */
export function viewSpecFromRelationPlan(plan: RelationPlan): ViewSpec {
  return {
    answer: plan.answer,
    includeCredits: plan.view?.includeCredits,
    creditLimit: plan.view?.creditLimit,
    includeBiography: plan.view?.includeBiography,
  };
}

/**
 * 从工作副本切出给汇总模型的证据。
 * @param workspace 本轮工作副本
 * @param spec 视图说明
 * @param focus 指定要展示的 id；缺省时用最近列表或启发式
 * @returns 不含 raw_result 的精简视图
 */
export function buildEvidenceView(
  workspace: WorkingSet,
  spec: ViewSpec,
  focus?: { movieIds?: number[]; personIds?: number[] },
): AgentEvidenceView {
  const movieLimit = spec.movieLimit ?? VIEW_CONSTANTS.MOVIE_LIMIT;
  const movieIds = resolveMovieIds(workspace, spec, focus);
  const personIds = resolvePersonIds(workspace, focus);

  const movies = compact(
    takeFirst(movieIds, movieLimit).map((id) => workspace.toMovieView(id)),
  );
  const people = compact(
    personIds.map((id) => workspace.toPersonView(id, spec)),
  );

  const view: AgentEvidenceView = { answer: spec.answer };
  if (people.length) view.people = people;
  if (movies.length) view.movies = movies;
  view.stats = {
    movie_candidates: movieIds.length,
    movie_kept: movies.length,
    person_kept: people.length,
  };
  return view;
}

/**
 * 写入 turn_events 的 Tool 摘要，不含 raw_result 和长列表。
 * @param output ToolsRegistry.execute 的返回值
 * @returns 可进 JSONB 的短对象
 */
export function toToolEventOutput(output: {
  success?: boolean;
  error?: string;
  data?: unknown;
}): Record<string, unknown> {
  return {
    success: output.success !== false,
    error: output.error,
    summary: summarizeToolData(output.data),
  };
}

/**
 * 决定视图里要展示哪些影片 id：focus → 最近列表 → 影片表 → 作品表。
 * @param workspace 本轮工作副本
 * @param spec 是否展开作品表
 * @param focus 调用方指定的 id
 */
function resolveMovieIds(
  workspace: WorkingSet,
  spec: ViewSpec,
  focus?: { movieIds?: number[]; personIds?: number[] },
): number[] {
  if (focus?.movieIds?.length) return uniqueIds(focus.movieIds);

  const listed = workspace.getMovieIds();
  if (listed.length) return listed;

  const stored = workspace.listMovieIds();
  if (stored.length) return stored;

  if (spec.includeCredits) {
    const creditLimit = spec.creditLimit ?? VIEW_CONSTANTS.CREDIT_LIMIT;
    const personId = focus?.personIds?.[0] ?? workspace.listPeople()[0]?.id;
    const person = personId !== undefined ? workspace.getPerson(personId) : undefined;
    if (person?.credits.length) {
      return takeFirst(
        person.credits.map((item) => item.movieId),
        creditLimit,
      );
    }
  }

  return workspace.listPeople().flatMap((person) =>
    person.credits.length
      ? takeFirst(
          person.credits.map((item) => item.movieId),
          VIEW_CONSTANTS.CREDIT_LIMIT,
        )
      : [],
  );
}

/**
 * 决定视图里要展示哪些人物 id：focus → 最近列表 → 人物表。
 * @param workspace 本轮工作副本
 * @param focus 调用方指定的 id
 */
function resolvePersonIds(
  workspace: WorkingSet,
  focus?: { movieIds?: number[]; personIds?: number[] },
): number[] {
  if (focus?.personIds?.length) return uniqueIds(focus.personIds);
  const listed = workspace.getPersonIds();
  if (listed.length) return listed;
  return workspace.listPeople().map((person) => person.id);
}

/**
 * 从 Tool `data` 抽出写入 `turn_events` 的摘要：只留条数或 id/姓名，不进作品表原文。
 * 列表工具看 `results.length`；人物详情看 `movie_credits.cast/crew` 条数之和。
 * @param data ToolResult.data
 * @example
 * `{ person_id: 31, name: "汤姆·汉克斯", movie_credits: { cast: [{}, {}], crew: [{}] } }`
 * → `{ person_id: 31, name: "汤姆·汉克斯", credit_count: 3 }`
 */
function summarizeToolData(data: unknown): Record<string, unknown> {
  const record = asRecord(data);
  if (!record) return {};

  if (Array.isArray(record.results)) {
    return { result_count: record.results.length };
  }

  const personId = readFiniteNumber(record.person_id ?? record.id);
  if (personId !== undefined && getStringValue(record.name)) {
    const credits = asRecord(record.movie_credits);
    return {
      person_id: personId,
      name: record.name,
      credit_count:
        asArray(credits?.cast).length + asArray(credits?.crew).length,
    };
  }

  const movieId = readFiniteNumber(record.movie_id ?? record.id);
  if (movieId !== undefined) {
    return { movie_id: movieId, title: record.title };
  }
  return {};
}

/**
 * 把 `person_detail` 的 `movie_credits.cast` / `movie_credits.crew` 收成人物作品表。
 * 先 `asRecordRows` 丢掉非对象；再要求该行能读出影片 id 和片名，否则也丢掉。
 * `character` / `job` / `department` 各自有文本才展开，和职务种类无关；以后加字段同样一行 `presentText`。
 * @param rows TMDB `movie_credits.cast` 与 `crew` 拼在一起即可
 * @example
 * [
 *   { id: 550, title: "搏击俱乐部", release_date: "1999-10-15", poster_path: "/p.jpg", character: "Narrator", job: "Actor", department: "Acting" },
 *   "不是对象",
 * ]
 * → [
 *   { movieId: 550, title: "搏击俱乐部", releaseDate: "1999-10-15", posterPath: "/p.jpg", character: "Narrator", job: "Actor", department: "Acting" },
 * ]
 */
function readPersonCredits(rows: unknown[]): PersonCreditRecord[] {
  const credits: PersonCreditRecord[] = [];
  for (const row of asRecordRows(rows)) {
    const movie = readMovieRecord(row);
    if (!movie) continue;
    credits.push({
      movieId: movie.id,
      title: movie.title,
      releaseDate: movie.releaseDate,
      posterPath: movie.posterPath,
      ...presentText("character", row.character),
      ...presentText("job", row.job),
      ...presentText("department", row.department),
    });
  }
  return takeFirst(credits, TMDB_CONSTANTS.MAX_PERSON_CREDITS);
}

/**
 * 把 `movie_detail` 的 `credits.cast` / `credits.crew` 收成影片演职员。
 * 先 `asRecordRows` 丢掉字符串、null、数组等非对象；再要求该行能读出人物 id 和姓名，否则也丢掉。
 * 角色、职务、部门有文本才加字段，空串不加。
 * @param rows TMDB `credits.cast` 或 `credits.crew`
 * @example
 * [
 *   { id: 287, name: "布拉德·皮特", character: "Tyler Durden", job: "Actor", department: "Acting" },
 *   "不是对象",
 * ]
 * → [
 *   { personId: 287, name: "布拉德·皮特", character: "Tyler Durden", job: "Actor", department: "Acting" },
 * ]
 */
function readMovieCredits(rows: unknown[]): MovieCreditPerson[] {
  const credits: MovieCreditPerson[] = [];
  for (const row of asRecordRows(rows)) {
    const person = readPersonRecord(row);
    if (!person) continue;
    credits.push({
      personId: person.id,
      name: person.name,
      ...presentText("character", row.character),
      ...presentText("job", row.job),
      ...presentText("department", row.department),
    });
  }
  return credits;
}

/**
 * 从 TMDB 人物搜索项或 `person_detail` 抽出工作副本行。缺人物 id 或姓名则丢弃。
 * snake_case 收成 camelCase；传记入库时截断；没传 `extras.credits` 则作品表为空。
 * @param row 搜索结果项或详情对象
 * @param extras 详情里已解析好的作品表
 * @example
 * {
 *   id: 31,
 *   name: "汤姆·汉克斯",
 *   birthday: "1956-07-09",
 *   place_of_birth: "Concord, California",
 *   known_for_department: "Acting",
 *   biography: "美国演员。",
 * }
 * → {
 *   id: 31,
 *   name: "汤姆·汉克斯",
 *   birthday: "1956-07-09",
 *   placeOfBirth: "Concord, California",
 *   knownForDepartment: "Acting",
 *   biography: "美国演员。",
 *   credits: [],
 * }
 */
function readPersonRecord(
  row: Record<string, unknown>,
  extras?: Partial<Pick<PersonRecord, "credits">>,
): PersonRecord | undefined {
  const id = readFiniteNumber(row.person_id ?? row.id);
  const name = getStringValue(row.name);
  if (id === undefined || !name) return undefined;

  const biography = getStringValue(row.biography);
  return {
    id,
    name,
    birthday: getStringValue(row.birthday) || undefined,
    placeOfBirth: getStringValue(row.place_of_birth) || undefined,
    knownForDepartment: getStringValue(row.known_for_department) || undefined,
    biography: biography
      ? summarizeText(biography, VIEW_CONSTANTS.OVERVIEW_STORE_MAX_LENGTH * 4)
      : undefined,
    credits: extras?.credits ?? [],
  };
}

/**
 * 从 TMDB 影片搜索项、`movie_detail` 或人物 `known_for` 抽出工作副本行。缺影片 id 或片名则丢弃。
 * 片名兼容 `title` / `name`；剧情入库截断；没传 extras 时 cast / crew 为空数组。
 * @param row 搜索结果项、详情对象或 known_for
 * @param extras 详情里已解析好的演职员
 * @example
 * {
 *   id: 27205,
 *   title: "盗梦空间",
 *   release_date: "2010-07-16",
 *   poster_path: "/8ZTVqvK.jpg",
 *   overview: "一名盗梦者进入他人梦境。",
 *   vote_average: 8.4,
 * }
 * → {
 *   id: 27205,
 *   title: "盗梦空间",
 *   releaseDate: "2010-07-16",
 *   posterPath: "/8ZTVqvK.jpg",
 *   overview: "一名盗梦者进入他人梦境。",
 *   voteAverage: 8.4,
 *   cast: [],
 *   crew: [],
 * }
 */
function readMovieRecord(
  row: Record<string, unknown>,
  extras?: Partial<Pick<MovieRecord, "cast" | "crew">>,
): MovieRecord | undefined {
  const id = readFiniteNumber(row.movie_id ?? row.id);
  const title = getStringValue(row.title ?? row.name);
  if (id === undefined || !title) return undefined;

  return {
    id,
    title,
    releaseDate: getStringValue(row.release_date),
    posterPath: nullablePath(row.poster_path),
    overview: truncateOverview(row.overview),
    voteAverage: readFiniteNumber(row.vote_average),
    cast: extras?.cast ?? [],
    crew: extras?.crew ?? [],
  };
}

/**
 * 把工作副本影片或人物作品表条目收成汇总卡片：`title`→`name`，上映日只留四位年，海报保持相对路径。
 * @param source 影片表行（有 `id`）或作品表行（有 `movieId`）
 * @example
 * `{ id: 27205, title: "盗梦空间", releaseDate: "2010-07-16", posterPath: "/8ZTVqvK.jpg" }`
 * → `{ id: 27205, name: "盗梦空间", year: "2010", poster_path: "/8ZTVqvK.jpg" }`
 */
function movieRecordToView(
  source: { title: string; releaseDate: string; posterPath: string | null } & (
    | { id: number }
    | { movieId: number }
  ),
): MovieViewItem {
  return {
    id: "id" in source ? source.id : source.movieId,
    name: source.title,
    year: yearFromReleaseDate(source.releaseDate),
    poster_path: source.posterPath ?? undefined,
  };
}

/**
 * 取出 `movie_search` / `person_search` / `movie_discover` 的 `data.results`。
 * `results` 缺失时先收成 `[]`，再交给 `asRecordRows` 丢掉非对象。
 * @param record Tool `data`
 * @example
 * `{ results: [{ id: 27205, title: "盗梦空间" }, "坏行", null] }`
 * → `[{ id: 27205, title: "盗梦空间" }]`
 */
function resultRows(record: Record<string, unknown>): Record<string, unknown>[] {
  return asRecordRows(asArray(record.results));
}

/**
 * 把 TMDB 列表收成普通对象行：每项走 `asRecord`，字符串 / null / 数组丢掉。
 * @param rows `results`、`cast`、`crew` 这类未知数组
 * @example
 * `[{ id: 287, name: "布拉德·皮特" }, "坏行", null, [287]]`
 * → `[{ id: 287, name: "布拉德·皮特" }]`
 */
function asRecordRows(rows: unknown[]): Record<string, unknown>[] {
  return compact(rows.map(asRecord));
}

/**
 * 按 id 写入；已存在则合并有值标量，集合交给调用方。
 * @param store 人物表或影片表
 * @param incoming 本轮要并入的记录
 * @param collectionKeys 不走标量覆盖、由 mergeCollections 处理的字段
 * @param mergeCollections 集合去重合并
 */
function upsertIdentified<T extends { id: number }>(
  store: Map<number, T>,
  incoming: T,
  collectionKeys: readonly (keyof T)[],
  mergeCollections: (current: T, incoming: T) => void,
): void {
  const current = store.get(incoming.id);
  if (!current) {
    store.set(incoming.id, cloneDeep(incoming));
    return;
  }
  assignPresentScalars(current, incoming, collectionKeys);
  mergeCollections(current, incoming);
}

/**
 * 搜索 stub 与详情合并时：incoming 里有值的标量覆盖 current；空串 / null / undefined 不覆盖。
 * `id` 和集合字段（人物 `credits`、影片 `cast`/`crew`）跳过，留给去重合并。
 * @param current 已入库记录，会被原地修改
 * @param incoming 新数据
 * @param collectionKeys 交给集合合并的字段
 * @example
 * current = { id: 31, name: "汤姆", birthday: "1956-07-09", credits: [{ movieId: 13 }] }
 * incoming = { id: 31, name: "汤姆·汉克斯", birthday: "", credits: [] }
 * collectionKeys = ["credits"]
 * → { id: 31, name: "汤姆·汉克斯", birthday: "1956-07-09", credits: [{ movieId: 13 }] }
 */
function assignPresentScalars<T extends object>(
  current: T,
  incoming: T,
  collectionKeys: readonly (keyof T)[],
): void {
  const skip = new Set<string>(["id", ...collectionKeys.map(String)]);
  assignWith(current, incoming, (held, incomingValue, key) => {
    if (skip.has(String(key)) || !isPresentScalar(incomingValue)) return held;
    return incomingValue;
  });
}

/**
 * undefined / null / 空字符串视为「没带来新信息」，不覆盖已有值。0 会覆盖。
 * @param value 候选标量
 * @example
 * `"盗梦空间"` → `true`
 * `0` → `true`
 * `""` / `null` / `undefined` → `false`
 */
function isPresentScalar(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * 有文本才写入该字段，空串 / null 得到空对象，调用方用展开合并。
 * @param key 字段名
 * @param value TMDB 字符串
 * @example
 * `"character"` + `"Narrator"` → `{ character: "Narrator" }`
 */
function presentText<K extends string>(
  key: K,
  value: unknown,
): Partial<Record<K, string>> {
  const text = getStringValue(value);
  return text ? ({ [key]: text } as Partial<Record<K, string>>) : {};
}

/**
 * 演职员去重键：所属实体 id + 职务 + 角色。同一人在同一部片里演两个角色会留两条。
 * @param ownerId 影片 id（人物作品表）或人物 id（影片演职员）
 * @param item 职务/角色
 * @example
 * `550` + `{ job: "Actor", character: "Narrator" }` → `"550:Actor:Narrator"`
 */
function creditKey(
  ownerId: number,
  item: { job?: string; character?: string },
): string {
  return `${ownerId}:${item.job ?? ""}:${item.character ?? ""}`;
}

/**
 * 按写入顺序记下的 id 列表；同名 key 取最近一次。
 */
class KeyedIdLists {
  /** 从早到晚 */
  private readonly items: Array<{ key: string; ids: number[] }> = [];

  /**
   * @param key 列表名
   * @param ids TMDB id，写入前会去掉非法与重复项
   */
  add(key: string, ids: number[]): void {
    this.items.push({ key, ids: uniqueIds(ids) });
  }

  /**
   * @param key 不传则取最后一次写入
   * @returns 对应 id；没有则为空数组
   */
  get(key?: string): number[] {
    if (!key) return this.items.at(-1)?.ids ?? [];
    return findLast(this.items, (item) => item.key === key)?.ids ?? [];
  }
}

/**
 * TMDB `overview` 入库：去空白后截到 {@link VIEW_CONSTANTS.OVERVIEW_STORE_MAX_LENGTH}（200）。空串不要。
 * @param value TMDB overview
 * @example
 * `"  一名盗梦者进入他人梦境。  "` → `"一名盗梦者进入他人梦境。"`
 */
function truncateOverview(value: unknown): string | undefined {
  const text = getStringValue(value);
  if (!text) return undefined;
  return summarizeText(text, VIEW_CONSTANTS.OVERVIEW_STORE_MAX_LENGTH);
}

/**
 * TMDB `poster_path` 入库：保留相对路径，空串收成 null，前端再拼域名。
 * @param value TMDB poster_path
 * @example
 * `"/8ZTVqvK.jpg"` → `"/8ZTVqvK.jpg"`
 */
function nullablePath(value: unknown): string | null {
  const text = getStringValue(value);
  return text || null;
}
