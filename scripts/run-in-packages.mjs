import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = [
  "packages/contracts",
  "packages/auth-client",
  "client",
  "backend/auth-service",
  "backend/movie-service",
  "backend/message-service",
];

const script = process.argv[2];
if (!script) {
  console.error("Usage: node scripts/run-in-packages.mjs <script>");
  process.exit(1);
}
// Windows 下会拼进 shell 命令串，只放行普通脚本名。
if (!/^[\w.:-]+$/.test(script)) {
  console.error(`Invalid script name: ${script}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Node 20.12 起不再直接 spawn .cmd/.bat（CVE-2024-27980），Windows 只能交给 shell；
// 命令与参数合成一整串，避开 shell + args 数组的 DEP0190。
const isWindows = process.platform === "win32";
const [command, args] = isWindows
  ? [`pnpm ${script}`, []]
  : ["pnpm", [script]];

for (const dir of PACKAGES) {
  console.log(`\n> ${dir}: pnpm ${script}`);
  const result = spawnSync(command, args, {
    cwd: path.join(root, dir),
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.error) {
    console.error(`${dir}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
