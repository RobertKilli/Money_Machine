import {
  buildCoinGeckoMarketRequestPlan,
  buildEtherscanContractRequestPlan,
  parseCoinGeckoFixture,
  parseEtherscanFixture,
  projectCoinGeckoToNormalizedPackage,
  projectEtherscanToNormalizedPackage,
  type M5ProviderReceipt,
  type ParsedCoinGeckoFixture,
  type ParsedEtherscanFixture,
} from "./m5-provider-adapter-contracts";
import {
  executeM5ProviderPlan,
  requestPlanFromAdapterPlan,
  type M5CredentialReference,
  type M5ProviderCredentialPort,
  type M5ProviderExecutionBlocked,
  type M5ProviderExecutionInvalid,
  type M5ProviderExecutionSuccess,
  type M5ProviderHttpTransport,
  type M5ProviderRateLimitLease,
  type M5ProviderResponseParser,
} from "./m5-provider-execution-boundary";
import { buildManualIngestionToLineagePlan, type ManualIngestionPlan } from "./manual-ingestion-to-lineage";
import type { ManualNormalizedSourcePackage } from "./parse-m5-normalized-source-package";
import type { ProviderReadinessEvaluation } from "@/domain/intelligence/m5-provider-readiness";

export const M5_PROVIDER_FIXTURE_REPLAY_VERSION = "m5-provider-fixture-replay/v1" as const;

type ExecutionDependencies = Readonly<{
  readiness: ProviderReadinessEvaluation;
  transport: M5ProviderHttpTransport;
  credentials: M5ProviderCredentialPort;
  rateLimit?: M5ProviderRateLimitLease;
  now?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
}>;

type ReplayMaterial = Readonly<{
  idempotencyKey: string;
  requestedAt: string;
  startedAt: string;
  recordedAt: string;
  credential: M5CredentialReference;
}>;

export type M5ProviderFixtureReplayReady = Readonly<{
  status: "DRY_RUN_READY";
  replayVersion: typeof M5_PROVIDER_FIXTURE_REPLAY_VERSION;
  execution: M5ProviderExecutionSuccess;
  normalizedPackage: ManualNormalizedSourcePackage;
  ingestionPlan: ManualIngestionPlan;
}>;

export type M5ProviderFixtureReplayResult =
  | M5ProviderFixtureReplayReady
  | M5ProviderExecutionBlocked
  | M5ProviderExecutionInvalid;

const receiptMatchesTransport = (receipt: M5ProviderReceipt, retrievedAt: string): boolean => {
  if (receipt.receivedAt !== retrievedAt) return false;
  return receipt.pages === undefined || (
    receipt.pages.length === 1 &&
    receipt.pages[0]?.pageOrdinal === 0 &&
    receipt.pages[0]?.receivedAt === retrievedAt
  );
};

const json = (body: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new Error("M5_PROVIDER_FIXTURE_JSON_INVALID");
  }
};

const executionOptions = (input: ExecutionDependencies) => ({
  readiness: input.readiness,
  transport: input.transport,
  credentials: input.credentials,
  ...(input.rateLimit === undefined ? {} : { rateLimit: input.rateLimit }),
  ...(input.now === undefined ? {} : { now: input.now }),
  ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
  ...(input.signal === undefined ? {} : { signal: input.signal }),
});

const ready = (
  execution: M5ProviderExecutionSuccess,
  normalizedPackage: ManualNormalizedSourcePackage,
): M5ProviderFixtureReplayReady => Object.freeze({
  status: "DRY_RUN_READY",
  replayVersion: M5_PROVIDER_FIXTURE_REPLAY_VERSION,
  execution,
  normalizedPackage,
  ingestionPlan: buildManualIngestionToLineagePlan(normalizedPackage),
});

export async function executeM5CoinGeckoFixtureReplay(input: Readonly<ExecutionDependencies & ReplayMaterial & {
  coinId: string;
  contractAddress: string;
  from: string;
  to: string;
  datasetVersion?: string;
}>): Promise<M5ProviderFixtureReplayResult> {
  const adapterPlan = buildCoinGeckoMarketRequestPlan({
    coinId: input.coinId,
    contractAddress: input.contractAddress,
    from: input.from,
    to: input.to,
    ...(input.datasetVersion === undefined ? {} : { datasetVersion: input.datasetVersion }),
  });
  const plan = requestPlanFromAdapterPlan({
    plan: adapterPlan,
    requiredCapabilities: [
      { capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" },
      { capability: "MARKET_CAP", completeness: "COMPLETE" },
      { capability: "VOLUME_24H", completeness: "COMPLETE" },
    ],
    credential: input.credential,
  });
  let parsedFixture: ParsedCoinGeckoFixture | undefined;
  const parser: M5ProviderResponseParser = response => {
    const parsed = parseCoinGeckoFixture(json(response.body));
    if (
      parsed.datasetId !== response.plan.datasetId ||
      parsed.datasetVersion !== response.plan.datasetVersion ||
      parsed.providerSourceNamespace !== response.plan.providerSourceNamespace ||
      parsed.coinId !== input.coinId ||
      parsed.contractAddress !== input.contractAddress.toLowerCase() ||
      !receiptMatchesTransport(parsed.receipt, response.retrievedAt)
    ) throw new Error("M5_PROVIDER_FIXTURE_SCOPE_INVALID");
    parsedFixture = parsed;
    return {
      projection: parsed,
      payloadFingerprint: parsed.payloadFingerprint,
      effectiveAvailableAt: response.retrievedAt,
    };
  };
  const execution = await executeM5ProviderPlan({ plan, ...executionOptions(input), parser });
  if (execution.status !== "EXECUTED") return execution;
  if (parsedFixture === undefined || execution.payloadFingerprint !== parsedFixture.payloadFingerprint) throw new Error("M5_PROVIDER_FIXTURE_REPLAY_INVALID");
  const normalizedPackage = projectCoinGeckoToNormalizedPackage({
    fixture: parsedFixture,
    idempotencyKey: input.idempotencyKey,
    requestedAt: input.requestedAt,
    startedAt: input.startedAt,
    recordedAt: input.recordedAt,
  });
  return ready(execution, normalizedPackage);
}

export async function executeM5EtherscanFixtureReplay(input: Readonly<ExecutionDependencies & ReplayMaterial & {
  contractAddress: string;
  datasetVersion?: string;
}>): Promise<M5ProviderFixtureReplayResult> {
  const adapterPlan = buildEtherscanContractRequestPlan({
    contractAddress: input.contractAddress,
    ...(input.datasetVersion === undefined ? {} : { datasetVersion: input.datasetVersion }),
  });
  const plan = requestPlanFromAdapterPlan({
    plan: adapterPlan,
    requiredCapabilities: [{ capability: "CONTRACT_VERIFICATION", completeness: "COMPLETE" }],
    credential: input.credential,
  });
  let parsedFixture: ParsedEtherscanFixture | undefined;
  const parser: M5ProviderResponseParser = response => {
    const parsed = parseEtherscanFixture(json(response.body));
    if (
      parsed.datasetId !== response.plan.datasetId ||
      parsed.datasetVersion !== response.plan.datasetVersion ||
      parsed.providerSourceNamespace !== response.plan.providerSourceNamespace ||
      parsed.contractAddress !== input.contractAddress.toLowerCase() ||
      !receiptMatchesTransport(parsed.receipt, response.retrievedAt)
    ) throw new Error("M5_PROVIDER_FIXTURE_SCOPE_INVALID");
    parsedFixture = parsed;
    return {
      projection: parsed,
      payloadFingerprint: parsed.payloadFingerprint,
      effectiveAvailableAt: response.retrievedAt,
    };
  };
  const execution = await executeM5ProviderPlan({ plan, ...executionOptions(input), parser });
  if (execution.status !== "EXECUTED") return execution;
  if (parsedFixture === undefined || execution.payloadFingerprint !== parsedFixture.payloadFingerprint) throw new Error("M5_PROVIDER_FIXTURE_REPLAY_INVALID");
  const normalizedPackage = projectEtherscanToNormalizedPackage({
    fixture: parsedFixture,
    idempotencyKey: input.idempotencyKey,
    requestedAt: input.requestedAt,
    startedAt: input.startedAt,
    recordedAt: input.recordedAt,
  });
  return ready(execution, normalizedPackage);
}
