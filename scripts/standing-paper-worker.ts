import { StandingPaperWorker, type StandingPaperWorkerStatus } from "../src/application/paper-trading/run-standing-paper-worker";
import { StandingPaperPolicyRepository } from "../src/infrastructure/postgres/standing-paper-policy-repository";
import { assertLoopbackWorkerDatabase } from "../src/application/paper-trading/hosted-worker-target";
import { createConnection } from "node:net";

function argument(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (required) throw new Error(`PAPER_WORKER_ARGUMENT_REQUIRED:${name}`);
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`PAPER_WORKER_ARGUMENT_INVALID:${name}`);
  return value;
}

const connectionString = argument("--database-url")!;
const policyId = argument("--policy-id")!;
const workerId = argument("--worker-id")!;
const maxRoundsText = argument("--max-rounds", false);
const pollText = argument("--poll-ms", false);
const roundIntervalText = argument("--round-interval-ms", false);
assertLoopbackWorkerDatabase(connectionString);
let databaseUrl: URL;
try { databaseUrl = new URL(connectionString); }
catch { throw new Error("PAPER_WORKER_DATABASE_URL_INVALID"); }
if (!(["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname))) {
  throw new Error("PAPER_WORKER_REFUSES_NON_LOCAL_DATABASE");
}
const maxRounds = maxRoundsText === undefined ? undefined : Number(maxRoundsText);
const pollIntervalMs = pollText === undefined ? undefined : Number(pollText);
const roundIntervalMs = roundIntervalText === undefined ? undefined : Number(roundIntervalText);
const abortController = new AbortController();
let signalReceived = false;
const stop = () => { signalReceived = true; abortController.abort(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const controlPort = Number(process.env.MM_PAPER_WORKER_CONTROL_PORT);
const controlToken = process.env.MM_PAPER_WORKER_CONTROL_TOKEN;
if (!Number.isInteger(controlPort) || controlPort < 1 || controlPort > 65_535 || !controlToken) throw new Error("PAPER_WORKER_CONTROL_CHANNEL_REQUIRED");
let controlClosed = false;
const controlLine = createConnection({ host: "127.0.0.1", port: controlPort });
await new Promise<void>((resolve, reject) => {
  controlLine.once("connect", () => resolve());
  controlLine.once("error", () => reject(new Error("PAPER_WORKER_CONTROL_CHANNEL_FAILED")));
});
let controlBuffer = "";
controlLine.setEncoding("utf8");
controlLine.on("data", chunk => {
  controlBuffer += chunk;
  for (;;) {
    const newline = controlBuffer.indexOf("\n");
    if (newline < 0) break;
    const line = controlBuffer.slice(0, newline);
    controlBuffer = controlBuffer.slice(newline + 1);
    try {
      const message = JSON.parse(line) as { type?: string; token?: string };
      if (message.type === "STOP" && message.token === controlToken) {
        stop();
        controlLine.write(`${JSON.stringify({ type: "ACK", token: controlToken })}\n`);
      }
    } catch { /* Ignore malformed local control input. */ }
  }
});
controlLine.on("close", () => { if (!controlClosed) stop(); });
controlLine.on("error", () => { if (!controlClosed) stop(); });

const repository = new StandingPaperPolicyRepository(connectionString);
const statusOutput = (status: StandingPaperWorkerStatus, code?: string) => process.stdout.write(`${JSON.stringify({ component: "standing-paper-worker", status, ...(code ? { code } : {}) })}\n`);
try {
  const result = await new StandingPaperWorker(repository, {
    policyId, workerId, maxRounds, pollIntervalMs, roundIntervalMs, signal: abortController.signal, onStatus: statusOutput,
    onRound: (identity, round) => process.stdout.write(`${JSON.stringify({ component: "standing-paper-worker", status: "ROUND_SETTLED", identity, classification: "SIMULATED_PAPER_ONLY", decisions: round.paperPolicyDecisions.length, simulatedFills: round.executions.length })}\n`),
  }).run();
  process.stdout.write(`${JSON.stringify({ component: "standing-paper-worker", ...result })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "PAPER_WORKER_UNKNOWN_FAILURE";
  const code = message.startsWith("PAPER_WORKER_FAILED:") ? message.slice("PAPER_WORKER_FAILED:".length) : message.split(":", 2)[0];
  process.stderr.write(`${JSON.stringify({ component: "standing-paper-worker", status: "FAILED", code })}\n`);
  process.exitCode = 1;
} finally {
  // A signal aborts waits/new-round entry. An in-flight repository transaction
  // is allowed to settle before this close runs.
  await repository.close();
  controlClosed = true;
  controlLine.end();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (signalReceived && !process.exitCode) process.exitCode = 0;
}
