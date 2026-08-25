import axios, { AxiosRequestConfig, isAxiosError } from "axios";
import type { ErrorResponseBody } from "@an-movie/contracts";

const api = axios.create({
  baseURL: "/",
  timeout: 1000 * 300,
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
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
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

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!isAxiosError(error) || !error.response) {
    return new ApiError(error instanceof Error ? error.message : "请求失败", 0);
  }

  const status = error.response.status;
  const data = error.response.data as ErrorResponseBody | string | undefined;
  if (data && typeof data === "object") {
    const message =
      typeof data.message === "string" && data.message
        ? data.message
        : error.response.statusText || "请求失败";
    return new ApiError(message, status, data.code, data.details, data.requestId);
  }
  if (typeof data === "string" && data) {
    return new ApiError(data, status);
  }
  return new ApiError(error.response.statusText || "请求失败", status);
}
