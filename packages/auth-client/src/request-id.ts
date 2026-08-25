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

type IncomingReq = { headers: Record<string, string | string[] | undefined> };
type OutgoingRes = { setHeader: (name: string, value: string) => void };

function readIncomingId(req: IncomingReq): string {
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
  const id = readIncomingId(req);
  res.setHeader(HEADER, id);
  RequestId.run(id, () => next());
}
