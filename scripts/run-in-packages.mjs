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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

for (const dir of PACKAGES) {
  console.log(`\n> ${dir}: pnpm ${script}`);
  const result = spawnSync(pnpmBin, [script], {
    cwd: path.join(root, dir),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
