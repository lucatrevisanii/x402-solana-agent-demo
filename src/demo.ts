import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} -> exit ${code}`))));
  });
}

async function main(): Promise<void> {
  if (!existsSync(".demo.json")) await run("npx", ["tsx", "src/setup.ts"]);

  const server = spawn("npx", ["tsx", "src/server.ts"], { stdio: "inherit" });
  await sleep(1500); // let the server bind
  try {
    await run("npx", ["tsx", "src/agent.ts"]);
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
