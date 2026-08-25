import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 解析仓库里的 .proto。本地 cwd 是服务目录时文件在 `../proto`；Docker 里在 `/app/proto`。
 * @param fileName 如 `auth.proto`
 * @param envName 可选覆盖路径的环境变量
 */
export function resolveProtoFile(fileName: string, envName?: string): string {
  if (envName) {
    const fromEnv = process.env[envName];
    if (fromEnv && existsSync(fromEnv)) {
      return fromEnv;
    }
  }

  const candidates = [
    join(process.cwd(), "proto", fileName),
    join(process.cwd(), "..", "proto", fileName),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(`proto file not found: ${fileName}`);
  }
  return found;
}
