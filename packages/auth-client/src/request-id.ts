import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage<string>();
const HEADER = "x-request-id";

export const RequestId = {
  run<T>(id: string, fn: () => T): T {
    return storage.run(id, fn);
  },
  current(): string | undefined {
    return storage.getStore();
  },
};

type IncomingReq = {
  headers: Record<string, string | string[] | undefined>;
  id?: unknown;
};
type OutgoingRes = { setHeader: (name: string, value: string) => void };

/**
 * 优先用 pino 写在 `req.id` 上的值，否则读 `x-request-id`，再没有就新建。
 * @example
 * `{ id: "from-pino", headers: {} }` → `"from-pino"`
 * `{ headers: { "x-request-id": "abc" } }` → `"abc"`
 */
export function readRequestId(req: IncomingReq): string {
  if (req.id !== undefined && req.id !== null) {
    const fromPino = String(req.id).trim();
    if (fromPino) return fromPino;
  }
  const raw = req.headers[HEADER];
  const text = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = text?.trim();
  return trimmed || randomUUID();
}

/** 在 Guard 之前写入 ALS，后续 HTTP / 出站 gRPC 都能读到。 */
export function requestIdMiddleware(
  req: IncomingReq,
  res: OutgoingRes,
  next: () => void,
): void {
  const id = readRequestId(req);
  res.setHeader(HEADER, id);
  RequestId.run(id, () => next());
}
