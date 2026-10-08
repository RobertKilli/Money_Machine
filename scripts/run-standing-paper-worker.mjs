import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tsx = resolve(root, "node_modules", "tsx", "dist", "cli.mjs");
const cli = resolve(root, "scripts", "standing-paper-worker.ts");
const child = spawn(process.execPath, ["--conditions=react-server", tsx, "--tsconfig", resolve(root, "scripts", "tsconfig.json"), cli, ...process.argv.slice(2)], { cwd: root, env: process.env, stdio: "inherit", windowsHide: true });
let receivedSignal;
const forwardSignal = signal => {
  receivedSignal = signal;
  if (!child.killed) child.kill(signal);
};
const onInterrupt = () => forwardSignal("SIGINT");
const onTerminate = () => forwardSignal("SIGTERM");
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);
child.once("error", error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("close", (code, signal) => {
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
  process.exitCode = code ?? (signal || receivedSignal ? 1 : 0);
});
