import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tsx = resolve(root, "node_modules", "tsx", "dist", "cli.mjs");
const cli = resolve(root, "scripts", "standing-paper-worker.ts");
const token = randomUUID();
const server = createServer();
let socket;
let stopRequested = false;
const sendStop = () => {
  stopRequested = true;
  if (socket?.writable) socket.write(`${JSON.stringify({ type: "STOP", token })}\n`);
};
const onInterrupt = () => sendStop();
const onTerminate = () => sendStop();
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);
let stdinBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  stdinBuffer += chunk;
  for (;;) {
    const newline = stdinBuffer.indexOf("\n");
    if (newline < 0) break;
    const command = stdinBuffer.slice(0, newline).trim();
    stdinBuffer = stdinBuffer.slice(newline + 1);
    if (command === ":stop") sendStop();
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("PAPER_WORKER_CONTROL_LISTENER_FAILED");
server.on("connection", connection => {
  if (socket) { connection.destroy(); return; }
  socket = connection;
  let controlBuffer = "";
  connection.setEncoding("utf8");
  connection.on("data", chunk => {
    controlBuffer += chunk;
    for (;;) {
      const newline = controlBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = controlBuffer.slice(0, newline);
      controlBuffer = controlBuffer.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        if (message.type === "ACK" && message.token === token) process.stdout.write('{"component":"standing-paper-worker-wrapper","status":"STOP_RECEIVED"}\n');
      } catch { /* Ignore malformed local control input. */ }
    }
  });
  if (stopRequested) sendStop();
});

const child = spawn(process.execPath, ["--conditions=react-server", tsx, "--tsconfig", resolve(root, "scripts", "tsconfig.json"), cli, ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, MM_PAPER_WORKER_CONTROL_PORT: String(address.port), MM_PAPER_WORKER_CONTROL_TOKEN: token },
  stdio: ["ignore", "inherit", "inherit"],
  windowsHide: true,
});
child.once("error", error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("close", async (code, signal) => {
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
  process.stdin.removeAllListeners("data");
  process.stdin.pause();
  socket?.destroy();
  await new Promise(resolveClose => server.close(() => resolveClose()));
  process.exitCode = code ?? (signal ? 1 : 0);
});
