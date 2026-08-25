import axios, { AxiosRequestConfig, isAxiosError } from "axios";
import {
  SSE_WIRE,
  STREAM_EVENT,
  type ErrorResponseBody,
  type RecommendStreamEvent,
} from "@an-movie/contracts";
import { API_PATH, AUTH_STORAGE_KEY, HTTP_CONSTANTS, TEXT } from "@/constant";
import {
  consumeSseFrames,
  isEventStreamContentType,
  parseRecommendSseFrame,
} from "@/utils/recommend-stream";

const api = axios.create({
  baseURL: "/",
  timeout: HTTP_CONSTANTS.REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export async function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const token = readToken();
  if (!config.headers) config.headers = {};
  if (token) {
    (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await api.request<T>(config);
    return response.data;
  } catch (error: unknown) {
    throw toApiError(error);
  }
}

/**
 * 只给 recommend 用：读 SSE，每帧回调一次。其它接口继续走 `request()`。
 */
export async function streamRecommend(
  body: {
    message: string;
    imageData?: string;
    conversationId?: string;
  },
  onEvent: (event: RecommendStreamEvent) => void,
): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    HTTP_CONSTANTS.REQUEST_TIMEOUT_MS,
  );

  try {
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    };
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(API_PATH.recommend, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok || !isEventStreamContentType(response.headers.get("content-type"))) {
      throw await apiErrorFromResponse(response);
    }
    if (!response.body) {
      throw new ApiError(TEXT.recommend.streamIncomplete, response.status);
    }

    await readRecommendStream(response.body, onEvent);
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    if (isAbortError(error)) {
      throw new ApiError(TEXT.recommend.timeout, 0);
    }
    throw toApiError(error);
  } finally {
    window.clearTimeout(timer);
  }
}

async function readRecommendStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: RecommendStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;

  const handleFrame = (frame: string) => {
    if (terminal) return;
    const event = parseRecommendSseFrame(frame);
    if (!event) return;
    onEvent(event);
    if (
      event.event === STREAM_EVENT.FINAL ||
      event.event === STREAM_EVENT.ERROR
    ) {
      terminal = true;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const { frames, rest } = consumeSseFrames(buffer);
      buffer = rest;
      for (const frame of frames) handleFrame(frame);
    }
    buffer += decoder.decode().replace(/\r\n/g, "\n");
    const { frames } = consumeSseFrames(buffer + SSE_WIRE.FRAME_SEPARATOR);
    for (const frame of frames) handleFrame(frame);
  } finally {
    reader.releaseLock();
  }

  if (!terminal) {
    throw new ApiError(TEXT.recommend.streamIncomplete, 0);
  }
}

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  try {
    const data: unknown = await response.json();
    return fromErrorBody(response.status, data, response.statusText);
  } catch {
    return new ApiError(
      response.statusText || TEXT.app.requestFailed,
      response.status,
    );
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!isAxiosError(error) || !error.response) {
    return new ApiError(
      error instanceof Error ? error.message : TEXT.app.requestFailed,
      0,
    );
  }

  return fromErrorBody(
    error.response.status,
    error.response.data,
    error.response.statusText,
  );
}

function fromErrorBody(
  status: number,
  data: unknown,
  statusText: string,
): ApiError {
  if (data && typeof data === "object") {
    const body = data as ErrorResponseBody | Record<string, unknown>;
    const message =
      typeof body.message === "string" && body.message
        ? body.message
        : statusText || TEXT.app.requestFailed;
    return new ApiError(
      message,
      status,
      typeof body.code === "string" ? body.code : undefined,
      "details" in body ? body.details : undefined,
      typeof body.requestId === "string" ? body.requestId : undefined,
    );
  }
  if (typeof data === "string" && data) {
    return new ApiError(data, status);
  }
  return new ApiError(statusText || TEXT.app.requestFailed, status);
}

function readToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem(AUTH_STORAGE_KEY.TOKEN)
    : null;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
