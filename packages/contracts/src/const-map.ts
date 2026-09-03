/**
 * 从 `as const` 对象取出值列表，给 `.includes` / DTO `IsIn` 用。
 *
 * @param obj 封闭取值对象
 * @returns 值数组，顺序与对象键的插入顺序相同
 * @example
 * constValues({ SUCCESS: "success", REJECT: "reject" })
 * // → ["success", "reject"]
 */
export function constValues<const T extends Record<string, string>>(
  obj: T,
): readonly T[keyof T][] {
  return Object.values(obj) as T[keyof T][];
}

/**
 * 去掉常量对象的一个键，运行时对应 {@link Omit}。
 *
 * @param obj 源对象
 * @param key 要去掉的键
 * @returns 不含该键的浅拷贝
 * @example
 * omitKey({ RUNNING: "running", SUCCESS: "success" }, "RUNNING")
 * // → { SUCCESS: "success" }
 */
export function omitKey<const T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> {
  const { [key]: _dropped, ...rest } = obj;
  return rest as Omit<T, K>;
}

/**
 * 从常量对象抽出若干键，运行时对应 {@link Pick}。值仍是源对象上的同一份。
 *
 * @param obj 源对象
 * @param keys 要保留的键，顺序与返回对象的插入顺序相同
 * @returns 只含这些键的浅拷贝
 * @example
 * pickKeys(
 *   { INTENT: "intent", PLAN: "plan", LLM_USAGE: "llm_usage" },
 *   ["INTENT", "PLAN"],
 * )
 * // → { INTENT: "intent", PLAN: "plan" }
 */
export function pickKeys<
  const T extends Record<string, unknown>,
  const K extends readonly (keyof T)[],
>(obj: T, keys: K): Pick<T, K[number]> {
  const picked = {} as Pick<T, K[number]>;
  for (const key of keys) {
    picked[key] = obj[key];
  }
  return picked;
}
