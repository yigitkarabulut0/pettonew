import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error("Usage: node scripts/with-root-env.mjs <command> [...args]");
  process.exit(1);
}

const envPath = resolve(process.cwd(), ".env");
const raw = readFileSync(envPath, "utf8");

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    continue;
  }

  const separatorIndex = trimmed.indexOf("=");
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) {
    continue;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
