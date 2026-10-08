import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";
import { StandingPaperPolicyRepository } from "../src/infrastructure/postgres/standing-paper-policy-repository";
import { FIXTURE_ASSETS } from "../src/domain/strategy/fixture-assets";
import type { StandingPaperPolicy } from "../src/domain/risk/standing-paper-policy";

const connectionString = process.env.MM_STANDING_PAPER_TEST_DATABASE_URL;
if (!connectionString) throw new Error("PAPER_WORKER_DEMO_TASK_DATABASE_REQUIRED");
const parsed = new URL(connectionString);
if (parsed.hostname !== "127.0.0.1" || !/^\/mm_paper_[0-9a-f]{32}$/.test(parsed.pathname)) throw new Error("PAPER_WORKER_DEMO_REFUSES_NON_TASK_DATABASE");
const sql = postgres(connectionString, { max: 1, prepare: true });
const repository = new StandingPaperPolicyRepository(connectionString);
const ownerId = randomUUID();
const accountId = randomUUID();
const policyId = `synthetic-worker-demo-${randomUUID()}`;
try {
  await sql`insert into auth.users (id) values (${ownerId})`;
  await sql`insert into public.financial_accounts (id, owner_id, mode, status, base_currency_code) values (${accountId}, ${ownerId}, 'PAPER', 'ACTIVE', 'NOK')`;
  const policy: StandingPaperPolicy = {
    policyId, version: "standing-paper-policy/v1", identity: "synthetic-local-worker-demo", mode: "PAPER_ONLY", status: "DRAFT",
    financialAccountId: accountId, allowedInstrumentIds: FIXTURE_ASSETS.map(asset => asset.assetId), capitalBudgetMinor: 500_000n,
    maxOrderMinor: 100_000n, maxPositionMinor: 350_000n, maxGrossExposureMinor: 500_000n, maxLossMinor: 25_000n, maxPriceAgeMs: 86_400_000,
  };
  await repository.create(policy);
  await repository.transition(policyId, "ACTIVATE");
  process.stdout.write(`${JSON.stringify({ component: "standing-paper-worker-demo", policyId, policyMode: "PAPER_ONLY", syntheticInput: true, note: "Synthetic task database only; no exchange execution." })}\n`);
  const cli = resolve(process.cwd(), "scripts", "run-standing-paper-worker.mjs");
  const child = spawn(process.execPath, [cli, "--database-url", connectionString, "--policy-id", policyId, "--worker-id", "local-demo", "--max-rounds", "3"], { cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true });
  const exit = await new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  if (exit !== 0) throw new Error(`PAPER_WORKER_DEMO_CLI_FAILED:${exit}`);
} finally {
  await repository.close();
  await sql.end({ timeout: 5 });
}
