import { RequestId, readRequestId } from "./request-id";

const REQUEST_ID_HEADER = "x-request-id";

/** HTTP 探活 / 指标口，access log 和耗时指标都跳过。 */
export const OBSERVABILITY_SKIP_PATHS = ["/health", "/ready", "/metrics"] as const;

type ReqLike = {
  id?: unknown;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
};

type ResLike = { setHeader: (name: string, value: string) => void };

function requestPath(url: string | undefined): string {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * nestjs-pino `LoggerModule.forRoot({ pinoHttp })` 的公共配置。
 * 自动带 `service`、`requestId`；脱敏 Authorization；探活口不打 access log。
 * @param service 进程名，写入每条日志
 */
export function createPinoHttpOptions(service: string) {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    genReqId(req: ReqLike, res: ResLike): string {
      const id = readRequestId(req);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    customProps(req: ReqLike) {
      return { service, requestId: readRequestId(req) };
    },
    mixin() {
      return {
        service,
        requestId: RequestId.current(),
      };
    },
    quietReqLogger: true,
    autoLogging: {
      ignore(req: ReqLike) {
        const path = requestPath(req.url);
        return (OBSERVABILITY_SKIP_PATHS as readonly string[]).includes(path);
      },
    },
    redact: ["req.headers.authorization", "req.headers.cookie"],
  };
}
