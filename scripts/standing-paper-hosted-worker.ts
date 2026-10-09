import { StandingPaperWorker, type StandingPaperWorkerStatus } from "../src/application/paper-trading/run-standing-paper-worker";
import { assertSupabaseProjectBinding, parseBoundedWorkerOptions, parseNokAmountMinor } from "../src/application/paper-trading/hosted-worker-target";
import { StandingPaperPolicyRepository } from "../src/infrastructure/postgres/standing-paper-policy-repository";

function readArguments(): Record<string, string> {
  const allowed = new Set(["--project-id", "--policy-id", "--account-id", "--worker-id", "--initial-capital-nok", "--max-rounds", "--round-interval-ms"]);
  const values: Record<string, string> = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]; const value = args[index + 1];
    if (!name || !allowed.has(name) || !value || value.startsWith("--") || Object.hasOwn(values, name)) throw new Error("PAPER_WORKER_ARGUMENT_INVALID");
    values[name] = value;
  }
  for (const name of allowed) if (!values[name]) throw new Error("PAPER_WORKER_ARGUMENT_REQUIRED");
  return values;
}

const SAFE_CODES = new Set([
  "PAPER_WORKER_STOP_REQUESTED", "PAPER_WORKER_HEARTBEAT_FAILED", "PAPER_WORKER_POLICY_NOT_ACTIVE", "PAPER_POLICY_STOPPED", "PAPER_POLICY_PAUSED", "PAPER_POLICY_NOT_ACTIVE", "POLICY_NOT_ACTIVE",
  "PAPER_WORKER_ACCOUNT_MISMATCH", "PAPER_WORKER_ACCOUNT_OWNER_MISMATCH", "PAPER_WORKER_ACCOUNT_NOT_RUNNABLE",
  "PAPER_WORKER_TARGET_INVALID", "PAPER_WORKER_TARGET_NOT_FOUND", "PAPER_WORKER_ACCOUNT_OWNER_MISSING",
  "PAPER_WORKER_POLICY_INVALID", "PAPER_WORKER_INSTRUMENT_SCOPE_INVALID", "PAPER_WORKER_INITIAL_CAPITAL_INVALID", "PAPER_WORKER_INITIAL_CAPITAL_EXCEEDS_BUDGET",
  "PAPER_INITIAL_CAPITAL_INVALID", "PAPER_INITIAL_CAPITAL_CONFLICT", "PAPER_INITIAL_CAPITAL_BINDING_MISSING", "PAPER_INITIAL_CAPITAL_REQUIRES_EMPTY_CHECKPOINT",
  "PAPER_LEDGER_CHECKPOINT_MISMATCH", "PAPER_ACQUISITION_CHECKPOINT_MISMATCH", "PAPER_CAPITAL_CHECKPOINT_MISMATCH",
  "PAPER_CHECKPOINT_INVALID", "PAPER_CHECKPOINT_NOT_LAST_RUN_RESULT", "PAPER_CHECKPOINT_WITHOUT_RUN",
  "PAPER_MATERIAL_INVALID", "PAPER_ROUND_TIMESTAMP_REGRESSION", "PAPER_DATABASE_SSL_REQUIRED",
  "PAPER_WORKER_PROJECT_ID_INVALID", "PAPER_WORKER_DATABASE_URL_INVALID", "PAPER_WORKER_DATABASE_URL_REQUIRED",
  "PAPER_WORKER_HOSTED_ENTRYPOINT_REFUSES_LOCAL_DATABASE", "PAPER_WORKER_PROJECT_BINDING_MISMATCH",
  "PAPER_WORKER_ARGUMENT_INVALID", "PAPER_WORKER_ARGUMENT_REQUIRED", "PAPER_WORKER_ID_INVALID",
  "PAPER_WORKER_ACCOUNT_ID_INVALID", "PAPER_WORKER_CAPITAL_FORMAT_INVALID", "PAPER_WORKER_CAPITAL_MUST_BE_POSITIVE",
  "PAPER_WORKER_MAX_ROUNDS_INVALID", "PAPER_WORKER_ROUND_INTERVAL_INVALID", "PAPER_WORKER_UNKNOWN_FAILURE",
]);
const safeCode = (candidate?: string): string => candidate && SAFE_CODES.has(candidate) ? candidate : "PAPER_WORKER_UNKNOWN_FAILURE";

const abortController = new AbortController();
let stopping = false;
const stop = () => { stopping = true; abortController.abort(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.stdin.setEncoding("utf8");
let stdinBuffer = "";
process.stdin.on("data", chunk => {
  stdinBuffer += chunk;
  for (;;) {
    const newline = stdinBuffer.indexOf("\n");
    if (newline < 0) break;
    const command = stdinBuffer.slice(0, newline).trim();
    stdinBuffer = stdinBuffer.slice(newline + 1);
    if (command === ":stop") stop();
  }
});

let repository: StandingPaperPolicyRepository | undefined;
try {
  const args = readArguments();
  const projectId = args["--project-id"]!;
  const policyId = args["--policy-id"]!;
  const accountId = args["--account-id"]!;
  const workerId = args["--worker-id"]!;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(workerId)) throw new Error("PAPER_WORKER_ID_INVALID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) throw new Error("PAPER_WORKER_ACCOUNT_ID_INVALID");
  const capitalMinor = parseNokAmountMinor(args["--initial-capital-nok"]!);
  const { maxRounds, roundIntervalMs } = parseBoundedWorkerOptions({ maxRounds: args["--max-rounds"]!, roundIntervalMs: args["--round-interval-ms"]! });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("PAPER_WORKER_DATABASE_URL_REQUIRED");
  assertSupabaseProjectBinding(connectionString, projectId);

  repository = new StandingPaperPolicyRepository(connectionString, { ssl: "require" });
  const target = await repository.validateWorkerTarget(policyId, accountId, capitalMinor);
  const policy = target.policy;
  if (abortController.signal.aborted) throw new Error("PAPER_WORKER_STOP_REQUESTED");
  process.stdout.write(`${JSON.stringify({ component: "standing-paper-hosted-worker", status: "PREFLIGHT_READY", classification: "PAPER_ONLY", projectId, policyId: policy.policyId, accountId: policy.financialAccountId, capitalMinor: capitalMinor.toString(), capitalBudgetMinor: policy.capitalBudgetMinor.toString(), maxRounds, roundIntervalMs, dataSource: "SYNTHETIC_FIXTURE" })}\n`);
  const onStatus = (status: StandingPaperWorkerStatus, code?: string) => process.stdout.write(`${JSON.stringify({ component: "standing-paper-hosted-worker", status, ...(code ? { code: safeCode(code) } : {}) })}\n`);
  const result = await new StandingPaperWorker(repository, {
    policyId, workerId, expectedAccountId: accountId, expectedOwnerId: target.ownerId, policyScopedRoundOrdinal: true, initialCapitalMinor: capitalMinor,
    maxRounds, roundIntervalMs, signal: abortController.signal, onStatus,
    onRound: (identity, round) => process.stdout.write(`${JSON.stringify({ component: "standing-paper-hosted-worker", status: "ROUND_SETTLED", identity, classification: "SIMULATED_PAPER_ONLY", decisions: round.paperPolicyDecisions.length, simulatedFills: round.executions.length, virtualContributionsMinor: round.config.contributionEvents.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString() })}\n`),
  }).run();
  process.stdout.write(`${JSON.stringify({ component: "standing-paper-hosted-worker", ...result })}\n`);
} catch (error) {
  const raw = error instanceof Error ? error.message : "PAPER_WORKER_UNKNOWN_FAILURE";
  const code = safeCode(raw.startsWith("PAPER_WORKER_FAILED:") ? raw.slice("PAPER_WORKER_FAILED:".length) : raw.split(/[:\s]/, 1)[0]);
  process.stderr.write(`${JSON.stringify({ component: "standing-paper-hosted-worker", status: "FAILED", code })}\n`);
  process.exitCode = 1;
} finally {
  process.stdin.removeAllListeners("data");
  process.stdin.pause();
  if (repository) await repository.close();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (stopping && !process.exitCode) process.exitCode = 0;
}
