import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
import { stagingRuntimeEnv } from "../src/lib/staging-runtime";

function main() {
  const load = (name: string) =>
    existsSync(name) ? parse(readFileSync(name)) : {};
  const files = readdirSync(".", { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\.env(?:\.|$)/.test(entry.name))
    .map((entry) => load(entry.name));
  const env = stagingRuntimeEnv(
    load(".env.staging.local"),
    load(".env.local"),
    files,
    process.env,
  );
  console.log(
    "Isolated local staging configuration verified; billing, storage and ticket integrations disabled.",
  );
  if (process.argv.includes("--check")) return;
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
    { env, stdio: "inherit" },
  );
  child.on("error", () => {
    console.error("Could not start local staging.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}
try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Staging startup failed.",
  );
  process.exitCode = 1;
}
