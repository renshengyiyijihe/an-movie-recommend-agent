import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { OBSERVABILITY_SKIP_PATHS } from "./pino-http.options";
import { MetricsRegistry } from "./metrics.registry";

type HttpReq = {
  method?: string;
  url?: string;
  path?: string;
  route?: { path?: string };
};

type HttpRes = { statusCode?: number };

const HTTP_DURATION = "http_request_duration_seconds";
const HTTP_DURATION_HELP = "HTTP request duration in seconds";

function requestPath(req: HttpReq): string {
  if (typeof req.route?.path === "string" && req.route.path) {
    return req.route.path;
  }
  const raw = req.path ?? req.url ?? "";
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
}

function statusOf(error: unknown, res: HttpRes): string {
  if (error instanceof HttpException) {
    return String(error.getStatus());
  }
  if (typeof res.statusCode === "number" && res.statusCode > 0) {
    return String(res.statusCode);
  }
  return error ? "500" : "200";
}

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<HttpReq>();
    const res = context.switchToHttp().getResponse<HttpRes>();
    const path = requestPath(req);
    if ((OBSERVABILITY_SKIP_PATHS as readonly string[]).includes(path)) {
      return next.handle();
    }

    const started = process.hrtime.bigint();
    const method = (req.method ?? "GET").toUpperCase();

    const observe = (error?: unknown) => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      this.metrics.observe(HTTP_DURATION, HTTP_DURATION_HELP, {
        method,
        path,
        status: statusOf(error, res),
      }, seconds);
    };

    return next.handle().pipe(
      tap({
        next: () => observe(),
        error: (error: unknown) => observe(error),
      }),
    );
  }
}
