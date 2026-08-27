import { AsyncLocalStorage } from "node:async_hooks";
import { WorkflowCancelledError } from "./errors/workflow-cancelled.error";

const storage = new AsyncLocalStorage<AbortSignal>();

/**
 * 本轮 chat 的取消信号。和 {@link UserContext} 一样用 ALS，
 * 不要把 `signal` 从 Orchestrator 传到 Tool。
 */
export const AbortContext = {
  run<T>(signal: AbortSignal, fn: () => T): T {
    return storage.run(signal, fn);
  },
  /** 不在 chat 请求里时为 undefined，LLM / TMDB 不绑 abort。 */
  current(): AbortSignal | undefined {
    return storage.getStore();
  },
  throwIfAborted(): void {
    if (storage.getStore()?.aborted) {
      throw new WorkflowCancelledError();
    }
  },
};
