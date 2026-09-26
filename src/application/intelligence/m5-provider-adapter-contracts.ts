import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import { deriveM5CryptoDailyMetrics, type DailyCloseObservationInput, type M5DailyDerivationsResult } from "@/domain/intelligence/m5-daily-derivations";
import { M5_NORMALIZED_SOURCE_PACKAGE_VERSION, parseM5NormalizedSourcePackage, type ManualNormalizedSourcePackage } from "./parse-m5-normalized-source-package";

export const M5_PROVIDER_ADAPTER_CONTRACT_VERSION = "m5-provider-adapter/v1" as const;
export const M5_PROVIDER_AVAILABILITY_POLICY_VERSION = "m5-provider-availability-policy/v1" as const;
export const M5_PROVIDER_PARSER_CONTRACT_VERSION = "m5-provider-fixture-parser/v1" as const;
export const M5_PROVIDER_ENVELOPE_SCHEMA_VERSION = "m5-provider-normalized-envelope/v1" as const;
export const M5_ETHEREUM_CHAIN_NAMESPACE = "eip155:1" as const;

type Obj = Record<string, unknown>;
const BLOCK_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INT64_MAX = (1n << 63n) - 1n;
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Obj)) freeze(child);
  }
  return value;
};
const object = (value: unknown, code: string): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(code);
  // Provider fixtures are JSON data, never executable object graphs. Reject
  // symbol keys and accessors so direct parser callers cannot hide fields or
  // trigger code while a fixture is inspected.
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(code);
  }
  return value as Obj;
};
const exact = (value: Obj, keys: readonly string[], code: string): void => {
  const allowed = new Set(keys);
  const unexpected = Reflect.ownKeys(value).find(key => typeof key !== "string" || !allowed.has(key));
  if (unexpected) {
    if (typeof unexpected === "string" && /(?:api[-_]?key|authorization|cookie|password|secret|token|credential|signature|url)/i.test(unexpected)) {
      throw new Error("M5_PROVIDER_SECRET_FIELD_REJECTED");
    }
    throw new Error(code);
  }
};
const text = (value: unknown, code: string, max = 512): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(code);
  return value.trim();
};
const timestamp = (value: unknown, code: string): string => normalizeIngestionTimestamp(value, code);
const integer = (value: unknown, code: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(code);
  return value as number;
};
const address = (value: unknown, code: string): string => {
  const result = text(value, code, 42);
  if (!ADDRESS.test(result)) throw new Error(code);
  return result.toLowerCase();
};
const chain = (value: unknown, code: string): void => {
  if (value !== M5_ETHEREUM_CHAIN_NAMESPACE) throw new Error(code);
};

export type M5ProviderRequestPlan = Readonly<{
  providerId: "coingecko" | "etherscan";
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  adapterContractVersion: typeof M5_PROVIDER_ADAPTER_CONTRACT_VERSION;
  parserContractVersion: typeof M5_PROVIDER_PARSER_CONTRACT_VERSION;
  endpointPath: string;
  query: Readonly<Record<string, string>>;
}>;

export type M5ProviderReceipt = Readonly<{
  receivedAt: string;
  providerPublishedAt?: string;
  pages?: readonly Readonly<{ pageOrdinal: number; receivedAt: string }>[];
}>;

export type M5ProviderAuthorityCapabilities = Readonly<{
  concentration: "UNSUPPORTED";
  suspicious: "UNSUPPORTED";
  canonicalIdentity: "UNSUPPORTED";
  commercialStorage: "BLOCKED_UNTIL_LEGAL_APPROVAL";
}>;

export type DecimalAtom = Readonly<{ valueAtoms: bigint; scale: number }>;

export type CoinGeckoDailyPoint = Readonly<{
  observedAt: string;
  price: DecimalAtom;
  marketCap?: DecimalAtom;
  volume?: DecimalAtom;
}>;

export type CoinGeckoPool = Readonly<{
  poolId: string;
  dexId: string;
  reserveUsd?: DecimalAtom;
  volume24hUsd?: DecimalAtom;
}>;

export type ParsedCoinGeckoFixture = Readonly<{
  providerId: "coingecko";
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: "coingecko:eth";
  contractAddress: string;
  coinId: string;
  receipt: M5ProviderReceipt;
  identityFingerprint: string;
  payloadFingerprint: string;
  daily: readonly CoinGeckoDailyPoint[];
  pools: readonly CoinGeckoPool[];
  capabilities: M5ProviderAuthorityCapabilities;
}>;

export type ParsedEtherscanFixture = Readonly<{
  providerId: "etherscan";
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: "etherscan:api-v2:1";
  contractAddress: string;
  chainNamespace: typeof M5_ETHEREUM_CHAIN_NAMESPACE;
  receipt: M5ProviderReceipt;
  creation?: Readonly<{ blockNumber: bigint; blockHash?: string; observedAt: string }>;
  verification: Readonly<{ state: "VERIFIED" | "UNVERIFIED" | "UNKNOWN"; proxy?: boolean; implementationAddress?: string }>;
  payloadFingerprint: string;
  capabilities: M5ProviderAuthorityCapabilities;
}>;

function parseDecimal(value: unknown, code: string): DecimalAtom {
  const raw = text(value, code, 128);
  if (!DECIMAL.test(raw)) throw new Error(code);
  const [whole, fraction = ""] = raw.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  const scale = normalizedFraction.length;
  const valueAtoms = BigInt(`${whole}${normalizedFraction}` || "0");
  if (valueAtoms < 0n || valueAtoms > INT64_MAX || scale > 18) throw new Error(code);
  return freeze({ valueAtoms, scale });
}

function parseEpoch(value: unknown, code: string): string {
  try {
    const milliseconds = typeof value === "number" ? BigInt(integer(value, code)) : BigInt(text(value, code, 32));
    if (milliseconds < 0n || milliseconds > 8_640_000_000_000_000n) throw new Error(code);
    return timestamp(new Date(Number(milliseconds)).toISOString(), code);
  } catch {
    throw new Error(code);
  }
}

function parseReceipt(value: unknown, code: string): M5ProviderReceipt {
  const item = object(value, code);
  exact(item, ["receivedAt", "providerPublishedAt", "pages"], code);
  const receivedAt = timestamp(item.receivedAt, code);
  const providerPublishedAt = item.providerPublishedAt === undefined ? undefined : timestamp(item.providerPublishedAt, code);
  if (providerPublishedAt && providerPublishedAt > receivedAt) throw new Error("M5_PROVIDER_AVAILABILITY_INVALID");
  const pages = item.pages === undefined ? undefined : (() => {
    if (!Array.isArray(item.pages) || item.pages.length === 0) throw new Error(code);
    const rows = item.pages.map(pageValue => {
      const page = object(pageValue, code);
      exact(page, ["pageOrdinal", "receivedAt"], code);
      return freeze({ pageOrdinal: integer(page.pageOrdinal, code), receivedAt: timestamp(page.receivedAt, code) });
    }).sort((a, b) => a.pageOrdinal - b.pageOrdinal);
    if (new Set(rows.map(row => row.pageOrdinal)).size !== rows.length) throw new Error(code);
    return freeze(rows);
  })();
  const effective = pages?.reduce((latest, page) => page.receivedAt > latest ? page.receivedAt : latest, receivedAt) ?? receivedAt;
  if (effective < receivedAt) throw new Error("M5_PROVIDER_AVAILABILITY_INVALID");
  return freeze({ receivedAt, ...(providerPublishedAt ? { providerPublishedAt } : {}), ...(pages ? { pages } : {}) });
}

function parseDailyRows(value: unknown, code: string): readonly CoinGeckoDailyPoint[] {
  if (!Array.isArray(value)) throw new Error(code);
  const rows = value.map(rowValue => {
    const row = object(rowValue, code);
    exact(row, ["timestamp", "price", "marketCap", "volume"], code);
    return freeze({
      observedAt: parseEpoch(row.timestamp, code),
      price: parseDecimal(row.price, code),
      ...(row.marketCap === null || row.marketCap === undefined ? {} : { marketCap: parseDecimal(row.marketCap, code) }),
      ...(row.volume === null || row.volume === undefined ? {} : { volume: parseDecimal(row.volume, code) }),
    });
  }).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (new Set(rows.map(row => row.observedAt)).size !== rows.length) throw new Error("M5_PROVIDER_DAILY_DUPLICATE_TIMESTAMP");
  return freeze(rows);
}

export function buildCoinGeckoMarketRequestPlan(input: Readonly<{ coinId: string; contractAddress: string; from: string; to: string; datasetVersion?: string }>): M5ProviderRequestPlan {
  text(input.coinId, "M5_PROVIDER_REQUEST_INVALID");
  const contract = address(input.contractAddress, "M5_PROVIDER_REQUEST_INVALID");
  const from = timestamp(input.from, "M5_PROVIDER_REQUEST_INVALID");
  const to = timestamp(input.to, "M5_PROVIDER_REQUEST_INVALID");
  if (from > to) throw new Error("M5_PROVIDER_REQUEST_INVALID");
  return freeze({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: input.datasetVersion ?? "coingecko-market-chart/v1", providerSourceNamespace: "coingecko:eth", adapterContractVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, parserContractVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, endpointPath: `/api/v3/coins/ethereum/contract/${contract}/market_chart/range`, query: freeze({ vs_currency: "usd", from: String(Math.floor(Date.parse(from) / 1000)), to: String(Math.floor(Date.parse(to) / 1000)), interval: "daily" }) });
}

export function buildEtherscanContractRequestPlan(input: Readonly<{ contractAddress: string; datasetVersion?: string }>): M5ProviderRequestPlan {
  const contract = address(input.contractAddress, "M5_PROVIDER_REQUEST_INVALID");
  return freeze({ providerId: "etherscan", datasetId: "etherscan-contract-authority", datasetVersion: input.datasetVersion ?? "etherscan-api-v2/v1", providerSourceNamespace: "etherscan:api-v2:1", adapterContractVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, parserContractVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, endpointPath: "/v2/api", query: freeze({ chainid: "1", module: "contract", action: "getsourcecode", address: contract }) });
}

export function buildEtherscanCreationRequestPlan(input: Readonly<{ contractAddress: string; datasetVersion?: string }>): M5ProviderRequestPlan {
  const contract = address(input.contractAddress, "M5_PROVIDER_REQUEST_INVALID");
  return freeze({ providerId: "etherscan", datasetId: "etherscan-contract-authority", datasetVersion: input.datasetVersion ?? "etherscan-api-v2/v1", providerSourceNamespace: "etherscan:api-v2:1", adapterContractVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, parserContractVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, endpointPath: "/v2/api", query: freeze({ chainid: "1", module: "contract", action: "getcontractcreation", contractaddresses: contract }) });
}

export function parseCoinGeckoFixture(input: unknown): ParsedCoinGeckoFixture {
  const root = object(input, "M5_COINGECKO_FIXTURE_INVALID");
  exact(root, ["providerId", "datasetId", "datasetVersion", "network", "contractAddress", "coinId", "receipt", "prices", "marketCaps", "totalVolumes", "pools"], "M5_COINGECKO_FIXTURE_UNKNOWN_FIELD");
  if (root.providerId !== "coingecko" || root.network !== "eth") throw new Error("M5_COINGECKO_SCOPE_INVALID");
  const contractAddress = address(root.contractAddress, "M5_COINGECKO_ADDRESS_INVALID");
  const prices = parseDailyRows(root.prices, "M5_COINGECKO_DAILY_INVALID");
  if (prices.some(row => row.price.valueAtoms <= 0n)) throw new Error("M5_COINGECKO_PRICE_INVALID");
  const marketCaps = parseDailyRows(root.marketCaps, "M5_COINGECKO_DAILY_INVALID");
  const volumes = parseDailyRows(root.totalVolumes, "M5_COINGECKO_DAILY_INVALID");
  if (prices.length !== marketCaps.length || prices.length !== volumes.length || prices.some((row, index) => row.observedAt !== marketCaps[index]?.observedAt || row.observedAt !== volumes[index]?.observedAt)) throw new Error("M5_COINGECKO_SERIES_ALIGNMENT_INVALID");
  const daily = freeze(prices.map((price, index) => freeze({ observedAt: price.observedAt, price: price.price, ...(marketCaps[index]?.marketCap ? { marketCap: marketCaps[index]!.marketCap } : {}), ...(volumes[index]?.price ? { volume: volumes[index]!.price } : {}) })));
  if (!Array.isArray(root.pools)) throw new Error("M5_COINGECKO_POOLS_INVALID");
  const pools = root.pools.map(poolValue => { const pool = object(poolValue, "M5_COINGECKO_POOL_INVALID"); exact(pool, ["poolId", "dexId", "reserveUsd", "volume24hUsd"], "M5_COINGECKO_POOL_UNKNOWN_FIELD"); return freeze({ poolId: text(pool.poolId, "M5_COINGECKO_POOL_INVALID"), dexId: text(pool.dexId, "M5_COINGECKO_POOL_INVALID"), ...(pool.reserveUsd === undefined || pool.reserveUsd === null ? {} : { reserveUsd: parseDecimal(pool.reserveUsd, "M5_COINGECKO_POOL_INVALID") }), ...(pool.volume24hUsd === undefined || pool.volume24hUsd === null ? {} : { volume24hUsd: parseDecimal(pool.volume24hUsd, "M5_COINGECKO_POOL_INVALID") }) }); }).sort((a, b) => a.poolId.localeCompare(b.poolId));
  const receipt = parseReceipt(root.receipt, "M5_COINGECKO_RECEIPT_INVALID");
  const coinId = text(root.coinId, "M5_COINGECKO_COIN_ID_INVALID");
  const identityFingerprint = canonicalSha256({ providerId: "coingecko", network: "eth", contractAddress, coinId });
  const datasetId = text(root.datasetId, "M5_COINGECKO_DATASET_INVALID");
  if (datasetId !== "coingecko-market-chart") throw new Error("M5_COINGECKO_SCOPE_INVALID");
  const datasetVersion = text(root.datasetVersion, "M5_COINGECKO_DATASET_VERSION_INVALID");
  const payloadFingerprint = canonicalSha256({ identityFingerprint, providerId: "coingecko", datasetId, datasetVersion, providerSourceNamespace: "coingecko:eth", daily, pools });
  return freeze({ providerId: "coingecko", datasetId, datasetVersion, providerSourceNamespace: "coingecko:eth", contractAddress, coinId, receipt, identityFingerprint, payloadFingerprint, daily, pools: freeze(pools), capabilities: freeze({ concentration: "UNSUPPORTED", suspicious: "UNSUPPORTED", canonicalIdentity: "UNSUPPORTED", commercialStorage: "BLOCKED_UNTIL_LEGAL_APPROVAL" }) });
}

export function parseEtherscanFixture(input: unknown): ParsedEtherscanFixture {
  const root = object(input, "M5_ETHERSCAN_FIXTURE_INVALID");
  exact(root, ["providerId", "datasetId", "datasetVersion", "chainid", "address", "receipt", "creation", "sourceCode", "apiStatus", "apiMessage"], "M5_ETHERSCAN_FIXTURE_UNKNOWN_FIELD");
  if (root.providerId !== "etherscan") throw new Error("M5_ETHERSCAN_SCOPE_INVALID");
  chain(`eip155:${root.chainid}`, "M5_ETHERSCAN_CHAIN_INVALID");
  const contractAddress = address(root.address, "M5_ETHERSCAN_ADDRESS_INVALID");
  const receipt = parseReceipt(root.receipt, "M5_ETHERSCAN_RECEIPT_INVALID");
  const creation = root.creation === undefined || root.creation === null ? undefined : (() => {
    const item = object(root.creation, "M5_ETHERSCAN_CREATION_INVALID");
    exact(item, ["blockNumber", "blockHash", "timestamp"], "M5_ETHERSCAN_CREATION_UNKNOWN_FIELD");
    const blockNumber = BigInt(text(item.blockNumber, "M5_ETHERSCAN_BLOCK_INVALID"));
    if (blockNumber < 0n || blockNumber > INT64_MAX) throw new Error("M5_ETHERSCAN_BLOCK_INVALID");
    const hashValue = item.blockHash === undefined ? undefined : text(item.blockHash, "M5_ETHERSCAN_BLOCK_HASH_INVALID", 66);
    if (hashValue !== undefined && !BLOCK_HASH.test(hashValue)) throw new Error("M5_ETHERSCAN_BLOCK_HASH_INVALID");
    return freeze({ blockNumber, ...(hashValue === undefined ? {} : { blockHash: hashValue.toLowerCase() }), observedAt: parseEpoch(item.timestamp, "M5_ETHERSCAN_CREATION_TIMESTAMP_INVALID") });
  })();
  const apiStatus = root.apiStatus === undefined ? undefined : text(root.apiStatus, "M5_ETHERSCAN_SOURCE_INVALID", 1);
  if (apiStatus !== undefined && apiStatus !== "0" && apiStatus !== "1") throw new Error("M5_ETHERSCAN_SOURCE_INVALID");
  if (root.apiMessage !== undefined) text(root.apiMessage, "M5_ETHERSCAN_SOURCE_INVALID", 256);
  const source = root.sourceCode === undefined || root.sourceCode === null ? undefined : object(root.sourceCode, "M5_ETHERSCAN_SOURCE_INVALID");
  if (source) exact(source, ["status", "proxy", "implementationAddress"], "M5_ETHERSCAN_SOURCE_UNKNOWN_FIELD");
  const status = apiStatus === "0" || !source ? "UNKNOWN" : source.status;
  if (apiStatus === "0" && source?.status !== undefined && source.status !== "UNKNOWN") throw new Error("M5_ETHERSCAN_SOURCE_CONFLICT");
  const proxy = source?.proxy === undefined ? undefined : source.proxy;
  if (proxy !== undefined && typeof proxy !== "boolean") throw new Error("M5_ETHERSCAN_SOURCE_INVALID");
  const implementationAddress = source?.implementationAddress === undefined ? undefined : address(source.implementationAddress, "M5_ETHERSCAN_IMPLEMENTATION_INVALID");
  const verification = status === "VERIFIED" ? (proxy === true && !implementationAddress ? { state: "UNKNOWN" as const, proxy } : { state: "VERIFIED" as const, ...(proxy === undefined ? {} : { proxy }), ...(implementationAddress ? { implementationAddress } : {}) }) : status === "UNVERIFIED" ? { state: "UNVERIFIED" as const } : status === "UNKNOWN" ? { state: "UNKNOWN" as const } : (() => { throw new Error("M5_ETHERSCAN_SOURCE_STATUS_INVALID"); })();
  const datasetId = text(root.datasetId, "M5_ETHERSCAN_DATASET_INVALID");
  if (datasetId !== "etherscan-contract-authority") throw new Error("M5_ETHERSCAN_SCOPE_INVALID");
  const datasetVersion = text(root.datasetVersion, "M5_ETHERSCAN_DATASET_VERSION_INVALID");
  const payloadFingerprint = canonicalSha256({ chainNamespace: M5_ETHEREUM_CHAIN_NAMESPACE, providerId: "etherscan", datasetId, datasetVersion, providerSourceNamespace: "etherscan:api-v2:1", contractAddress, creation: creation ? { blockNumber: creation.blockNumber.toString(), ...(creation.blockHash ? { blockHash: creation.blockHash } : {}), observedAt: creation.observedAt } : null, verification });
  return freeze({ providerId: "etherscan", datasetId, datasetVersion, providerSourceNamespace: "etherscan:api-v2:1", contractAddress, chainNamespace: M5_ETHEREUM_CHAIN_NAMESPACE, receipt, ...(creation ? { creation } : {}), verification: freeze(verification), payloadFingerprint, capabilities: freeze({ concentration: "UNSUPPORTED", suspicious: "UNSUPPORTED", canonicalIdentity: "UNSUPPORTED", commercialStorage: "BLOCKED_UNTIL_LEGAL_APPROVAL" }) });
}

function receiptAt(receipt: M5ProviderReceipt): string {
  return receipt.pages?.reduce((latest, page) => page.receivedAt > latest ? page.receivedAt : latest, receipt.receivedAt) ?? receipt.receivedAt;
}

function packageRecord(input: Readonly<{ providerExternalRecordId: string; providerRevision: string; observedAt: string; retrievedAt: string; recordedAt: string; providerPublishedAt?: string; envelope: Obj; selected: Obj; pageOrdinal: number; itemOrdinal: number; responsePath: string }>): Obj {
  if (input.observedAt > input.retrievedAt) throw new Error("M5_PROVIDER_AVAILABILITY_INVALID");
  const payloadFingerprint = canonicalSha256({ envelope: input.envelope, providerRevision: input.providerRevision });
  return { providerExternalRecordId: input.providerExternalRecordId, providerRevision: input.providerRevision, payloadFingerprint, pageOrdinal: input.pageOrdinal, itemOrdinal: input.itemOrdinal, retrievedAt: input.retrievedAt, recordedAt: input.recordedAt, ...(input.providerPublishedAt ? { providerPublishedAt: input.providerPublishedAt } : {}), observedAt: input.observedAt, normalizedEnvelope: input.envelope, selectedAuditableFields: input.selected, metadata: { cursorSafety: "NONE", responseHostPath: input.responsePath } };
}

export function validateM5ProviderNormalizedPackage(value: ManualNormalizedSourcePackage): ManualNormalizedSourcePackage {
  const expectedProvider = value.providerId === "coingecko" ? { datasetId: "coingecko-market-chart", namespace: "coingecko:eth" } : value.providerId === "etherscan" ? { datasetId: "etherscan-contract-authority", namespace: "etherscan:api-v2:1" } : undefined;
  if (!expectedProvider || value.datasetId !== expectedProvider.datasetId || value.providerSourceNamespace !== expectedProvider.namespace || value.adapterContractVersion !== M5_PROVIDER_ADAPTER_CONTRACT_VERSION || value.adapterVersion !== M5_PROVIDER_ADAPTER_CONTRACT_VERSION || value.parserContractVersion !== M5_PROVIDER_PARSER_CONTRACT_VERSION || value.parserVersion !== M5_PROVIDER_PARSER_CONTRACT_VERSION || value.envelopeSchemaVersion !== M5_PROVIDER_ENVELOPE_SCHEMA_VERSION) throw new Error("M5_PROVIDER_PACKAGE_SCOPE_INVALID");
  for (const record of value.records) {
    const envelope = object(record.normalizedEnvelope, "M5_PROVIDER_PACKAGE_ENVELOPE_INVALID");
    const expectedId = value.providerId === "coingecko" ? `${address(envelope.contractAddress, "M5_PROVIDER_PACKAGE_ID_INVALID")}:daily:${timestamp(envelope.observedAt, "M5_PROVIDER_PACKAGE_ID_INVALID")}` : `${address(envelope.contractAddress, "M5_PROVIDER_PACKAGE_ID_INVALID")}:${envelope.observationType === "CONTRACT_CREATION" ? "creation" : envelope.observationType === "CONTRACT_VERIFICATION" ? "verification" : (() => { throw new Error("M5_PROVIDER_PACKAGE_ID_INVALID"); })()}`;
    if (record.providerExternalRecordId !== expectedId) throw new Error("M5_PROVIDER_PACKAGE_ID_INVALID");
    if (record.providerRevision === undefined) throw new Error("M5_PROVIDER_PACKAGE_REVISION_INVALID");
    const expectedFingerprint = canonicalSha256({ envelope: record.normalizedEnvelope, providerRevision: record.providerRevision });
    if (record.payloadFingerprint !== expectedFingerprint) throw new Error("M5_PROVIDER_PACKAGE_FINGERPRINT_INVALID");
  }
  return value;
}

export function projectCoinGeckoToNormalizedPackage(input: Readonly<{ fixture: ParsedCoinGeckoFixture; idempotencyKey: string; requestedAt: string; startedAt: string; recordedAt: string }>): ManualNormalizedSourcePackage {
  const retrievedAt = receiptAt(input.fixture.receipt);
  const records = input.fixture.daily.map((point, index) => packageRecord({ providerExternalRecordId: `${input.fixture.contractAddress}:daily:${point.observedAt}`, providerRevision: input.fixture.payloadFingerprint, observedAt: point.observedAt, retrievedAt, recordedAt: input.recordedAt, ...(input.fixture.receipt.providerPublishedAt ? { providerPublishedAt: input.fixture.receipt.providerPublishedAt } : {}), pageOrdinal: 0, itemOrdinal: index, responsePath: "https://pro-api.coingecko.com/api/v3/coins/ethereum/contract/{address}/market_chart/range", envelope: { provider: "coingecko", network: "eth", contractAddress: input.fixture.contractAddress, coinId: input.fixture.coinId, observationType: "DAILY_CLOSE", observedAt: point.observedAt, closeValueAtoms: point.price.valueAtoms.toString(), priceScale: point.price.scale, quoteUnit: "USD", ...(point.marketCap ? { marketCapAtoms: point.marketCap.valueAtoms.toString(), marketCapScale: point.marketCap.scale } : {}), ...(point.volume ? { volumeAtoms: point.volume.valueAtoms.toString(), volumeScale: point.volume.scale } : {}) }, selected: { metric: "DAILY_MARKET_DATA", observedAt: point.observedAt, receiptAt: retrievedAt } }));
  return validateM5ProviderNormalizedPackage(parseM5NormalizedSourcePackage({ contractVersion: M5_NORMALIZED_SOURCE_PACKAGE_VERSION, idempotencyKey: input.idempotencyKey, providerId: "coingecko", datasetId: input.fixture.datasetId, datasetVersion: input.fixture.datasetVersion, providerSourceNamespace: input.fixture.providerSourceNamespace, adapterContractVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, adapterVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, parserContractVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, parserVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, envelopeSchemaVersion: M5_PROVIDER_ENVELOPE_SCHEMA_VERSION, attemptNumber: 1, requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt, requestScope: { network: "eth", contractAddress: input.fixture.contractAddress, coinId: input.fixture.coinId }, provenance: { system: "coingecko-fixture", reviewReference: M5_PROVIDER_AVAILABILITY_POLICY_VERSION }, executionInput: { endpointPath: "https://pro-api.coingecko.com/api/v3/coins/ethereum/contract/{address}/market_chart/range", interval: "daily" }, records }));
}

export function projectEtherscanToNormalizedPackage(input: Readonly<{ fixture: ParsedEtherscanFixture; idempotencyKey: string; requestedAt: string; startedAt: string; recordedAt: string }>): ManualNormalizedSourcePackage {
  const retrievedAt = receiptAt(input.fixture.receipt);
  const records = [
    ...(input.fixture.creation ? [packageRecord({ providerExternalRecordId: `${input.fixture.contractAddress}:creation`, providerRevision: input.fixture.payloadFingerprint, observedAt: input.fixture.creation.observedAt, retrievedAt, recordedAt: input.recordedAt, ...(input.fixture.receipt.providerPublishedAt ? { providerPublishedAt: input.fixture.receipt.providerPublishedAt } : {}), pageOrdinal: 0, itemOrdinal: 0, responsePath: "https://api.etherscan.io/v2/api", envelope: { provider: "etherscan", chainNamespace: M5_ETHEREUM_CHAIN_NAMESPACE, contractAddress: input.fixture.contractAddress, observationType: "CONTRACT_CREATION", blockNumber: input.fixture.creation.blockNumber.toString(), ...(input.fixture.creation.blockHash ? { blockHash: input.fixture.creation.blockHash } : {}), observedAt: input.fixture.creation.observedAt }, selected: { metric: "CONTRACT_CREATION", receiptAt: retrievedAt } })] : []),
    packageRecord({ providerExternalRecordId: `${input.fixture.contractAddress}:verification`, providerRevision: input.fixture.payloadFingerprint, observedAt: retrievedAt, retrievedAt, recordedAt: input.recordedAt, ...(input.fixture.receipt.providerPublishedAt ? { providerPublishedAt: input.fixture.receipt.providerPublishedAt } : {}), pageOrdinal: 0, itemOrdinal: input.fixture.creation ? 1 : 0, responsePath: "https://api.etherscan.io/v2/api", envelope: { provider: "etherscan", chainNamespace: M5_ETHEREUM_CHAIN_NAMESPACE, contractAddress: input.fixture.contractAddress, observationType: "CONTRACT_VERIFICATION", verificationState: input.fixture.verification.state, ...(input.fixture.verification.proxy === undefined ? {} : { proxy: input.fixture.verification.proxy }), ...(input.fixture.verification.implementationAddress ? { implementationAddress: input.fixture.verification.implementationAddress } : {}), observedAt: retrievedAt }, selected: { metric: "CONTRACT_VERIFICATION", receiptAt: retrievedAt } }),
  ];
  return validateM5ProviderNormalizedPackage(parseM5NormalizedSourcePackage({ contractVersion: M5_NORMALIZED_SOURCE_PACKAGE_VERSION, idempotencyKey: input.idempotencyKey, providerId: "etherscan", datasetId: input.fixture.datasetId, datasetVersion: input.fixture.datasetVersion, providerSourceNamespace: input.fixture.providerSourceNamespace, adapterContractVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, adapterVersion: M5_PROVIDER_ADAPTER_CONTRACT_VERSION, parserContractVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, parserVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, envelopeSchemaVersion: M5_PROVIDER_ENVELOPE_SCHEMA_VERSION, attemptNumber: 1, requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt, requestScope: { chainNamespace: M5_ETHEREUM_CHAIN_NAMESPACE, contractAddress: input.fixture.contractAddress }, provenance: { system: "etherscan-fixture", reviewReference: M5_PROVIDER_AVAILABILITY_POLICY_VERSION }, executionInput: { endpointPath: "https://api.etherscan.io/v2/api", chainid: "1", module: "contract" }, records }));
}

export function deriveCoinGeckoDailyMetrics(input: ParsedCoinGeckoFixture): M5DailyDerivationsResult {
  const asOf = receiptAt(input.receipt);
  const observations: DailyCloseObservationInput[] = input.daily.map(point => ({ observationId: `${input.coinId}:daily:${point.observedAt}`, observedAt: point.observedAt, availableAt: asOf, closeValue: point.price.valueAtoms, priceScale: point.price.scale, quoteUnit: "USD" }));
  return deriveM5CryptoDailyMetrics(observations, asOf);
}
