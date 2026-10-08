import { StandingPaperWorker, type StandingPaperWorkerStatus } from "../src/application/paper-trading/run-standing-paper-worker";
import { StandingPaperPolicyRepository } from "../src/infrastructure/postgres/standing-paper-policy-repository";

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
let databaseUrl: URL;
try { databaseUrl = new URL(connectionString); }
catch { throw new Error("PAPER_WORKER_DATABASE_URL_INVALID"); }
if (!((databaseUrl.hostname === "127.0.0.1" || databaseUrl.hostname === "localhost") && /^\/mm_paper_[0-9a-f]{32}$/.test(databaseUrl.pathname))) {
  throw new Error("PAPER_WORKER_REFUSES_NON_TASK_OWNED_LOCAL_DATABASE");
}
const maxRounds = maxRoundsText === undefined ? undefined : Number(maxRoundsText);
const pollIntervalMs = pollText === undefined ? undefined : Number(pollText);
const abortController = new AbortController();
let signalReceived = false;
const stop = () => { signalReceived = true; abortController.abort(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const repository = new StandingPaperPolicyRepository(connectionString);
const statusOutput = (status: StandingPaperWorkerStatus, code?: string) => process.stdout.write(`${JSON.stringify({ component: "standing-paper-worker", status, ...(code ? { code } : {}) })}\n`);
try {
  const result = await new StandingPaperWorker(repository, {
    policyId, workerId, maxRounds, pollIntervalMs, signal: abortController.signal, onStatus: statusOutput,
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
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (signalReceived && !process.exitCode) process.exitCode = 0;
}
