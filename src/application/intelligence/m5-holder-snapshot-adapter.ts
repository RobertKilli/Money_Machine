import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import {
  M5_ETHEREUM_CHAIN_ID,
  M5_HOLDER_FINALITY_POLICY_VERSION,
  createM5HolderSnapshot,
  deriveM5HolderConcentration,
  type M5HolderConcentrationResult,
  type M5HolderPage,
  type M5HolderSnapshot,
} from "@/domain/intelligence/m5-holder-concentration";
import { M5_NORMALIZED_SOURCE_PACKAGE_VERSION, parseM5NormalizedSourcePackage, type ManualNormalizedSourcePackage } from "./parse-m5-normalized-source-package";

export const M5_HOLDER_SNAPSHOT_ADAPTER_VERSION = "m5-holder-snapshot-adapter/v1" as const;
export const M5_HOLDER_PAGE_FIXTURE_VERSION = "m5-holder-page-fixture/v1" as const;
export const M5_HOLDER_FINALITY_POLICY = M5_HOLDER_FINALITY_POLICY_VERSION;

type Obj = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BLOCK_HASH = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_ATOM = /^(?:0|[1-9][0-9]*)$/;
const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Obj)) freeze(child);
  }
  return value;
};

const object = (value: unknown, code: string): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Obj;
};

const secretKey = /(api[_-]?key|authorization|cookie|password|secret|token|credential|signed|url)/i;
const exact = (value: Obj, keys: readonly string[], code: string): void => {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(secretKey.test(key) ? "M5_HOLDER_ADAPTER_SECRET_FIELD_REJECTED" : code);
  }
};

const text = (value: unknown, code: string, max = 512): string => {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > max) throw new Error(code);
  if (/:\/\/|[?#]/.test(value)) throw new Error("M5_HOLDER_ADAPTER_SECRET_FIELD_REJECTED");
  return value;
};

const timestamp = (value: unknown, code: string): string => normalizeIngestionTimestamp(value, code);
const integer = (value: unknown, code: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(code);
  return value as number;
};
const sha = (value: unknown, code: string): string => {
  const result = text(value, code, 64);
  if (!SHA256.test(result)) throw new Error(code);
  return result;
};
const address = (value: unknown, code: string): string => {
  const result = text(value, code, 42);
  if (!ADDRESS.test(result)) throw new Error(code);
  return result.toLowerCase();
};
const blockHash = (value: unknown, code: string): string => {
  const result = text(value, code, 66);
  if (!BLOCK_HASH.test(result)) throw new Error(code);
  return result.toLowerCase();
};
const atoms = (value: unknown, code: string, max = UINT256_MAX): bigint => {
  const result = text(value, code, 78);
  if (!DECIMAL_ATOM.test(result)) throw new Error(code);
  const parsed = BigInt(result);
  if (parsed > max) throw new Error(code);
  return parsed;
};

export type M5HolderSnapshotRequestPlan = Readonly<{
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  adapterContractVersion: typeof M5_HOLDER_SNAPSHOT_ADAPTER_VERSION;
  parserContractVersion: typeof M5_HOLDER_PAGE_FIXTURE_VERSION;
  chainId: typeof M5_ETHEREUM_CHAIN_ID;
  contractAddress: string;
  requestedBlockStrategy: "PINNED_SNAPSHOT_BLOCK";
  supplyBasis: "TOTAL_SUPPLY";
  addressPolicy: "INCLUDE_ALL";
  pageSize: number;
  finalityPolicyVersion: typeof M5_HOLDER_FINALITY_POLICY_VERSION;
  asOf: string;
}>;

export type M5HolderPageReceipt = Readonly<{ receivedAt: string; providerPublishedAt?: string }>;
export type M5HolderFinalityReference = Readonly<{
  referenceBlockNumber: bigint;
  referenceBlockHash: string;
  observedAt: string;
  receivedAt: string;
}>;
export type M5HolderPageItem = Readonly<{ itemOrdinal: number; address: string; balanceAtoms: bigint }>;
export type M5ParsedHolderPage = Readonly<{
  fixtureVersion: typeof M5_HOLDER_PAGE_FIXTURE_VERSION;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  chainId: typeof M5_ETHEREUM_CHAIN_ID;
  contractAddress: string;
  snapshotBlockNumber: bigint;
  snapshotBlockHash: string;
  snapshotBlockTimestamp: string;
  tokenDecimals: number;
  totalSupplyAtoms: bigint;
  declaredHolderCount: number;
  declaredPageCount: number;
  pageOrdinal: number;
  isFinal: boolean;
  nextPageState?: Readonly<{ kind: "MORE"; nextPageOrdinal: number }> | Readonly<{ kind: "NONE" }>;
  holders: readonly M5HolderPageItem[];
  receipt: M5HolderPageReceipt;
  sourceRecordId: string;
  payloadFingerprint: string;
  finality: M5HolderFinalityReference;
}>;

export type M5HolderAdapterDiagnosticCode =
  | "M5_HOLDER_ADAPTER_INCOMPLETE_PAGINATION"
  | "M5_HOLDER_ADAPTER_FINALITY_INSUFFICIENT"
  | "M5_HOLDER_ADAPTER_SCOPE_MISMATCH"
  | "M5_HOLDER_ADAPTER_BLOCK_MISMATCH"
  | "M5_HOLDER_ADAPTER_DUPLICATE"
  | "M5_HOLDER_ADAPTER_FINGERPRINT_INVALID"
  | "M5_HOLDER_ADAPTER_TIME_INVALID"
  | "M5_HOLDER_ADAPTER_SCHEMA_INVALID"
  | "M5_HOLDER_ADAPTER_SECRET_FIELD_REJECTED"
  | "M5_HOLDER_ADAPTER_COUNT_MISMATCH"
  | "M5_HOLDER_ADAPTER_SUPPLY_INVALID";

export type M5HolderCapabilityMarkers = Readonly<{
  completeSyntheticPageSet: "SUPPORTED";
  totalSupply: "SUPPORTED";
  includeAll: "SUPPORTED";
  blockBoundSnapshot: "SUPPORTED";
  finalityProof: "SUPPORTED";
  networkExecution: "UNSUPPORTED";
  topHolderOnly: "UNSUPPORTED";
  circulatingSupply: "UNSUPPORTED";
  addressClassification: "UNSUPPORTED";
  providerLegalApproval: "UNSUPPORTED";
  commercialRedistribution: "UNSUPPORTED";
  canonicalM5: "UNSUPPORTED";
}>;

export type M5HolderSnapshotAdapterResult =
  | Readonly<{ status: "COMPLETE"; request: M5HolderSnapshotRequestPlan; pages: readonly M5ParsedHolderPage[]; effectiveAvailableAt: string; finalityDepth: number; snapshot: M5HolderSnapshot; concentration: M5HolderConcentrationResult; normalizedPackage: ManualNormalizedSourcePackage; capabilities: M5HolderCapabilityMarkers; diagnostics: readonly [] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5HolderAdapterDiagnosticCode[]; capabilities: M5HolderCapabilityMarkers }>;

export type M5HolderPageSetResult =
  | Readonly<{ status: "COMPLETE"; request: M5HolderSnapshotRequestPlan; pages: readonly M5ParsedHolderPage[]; effectiveAvailableAt: string; finalityDepth: number; diagnostics: readonly [] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5HolderAdapterDiagnosticCode[]; capabilities: M5HolderCapabilityMarkers }>;

const capabilities: M5HolderCapabilityMarkers = freeze({ completeSyntheticPageSet: "SUPPORTED", totalSupply: "SUPPORTED", includeAll: "SUPPORTED", blockBoundSnapshot: "SUPPORTED", finalityProof: "SUPPORTED", networkExecution: "UNSUPPORTED", topHolderOnly: "UNSUPPORTED", circulatingSupply: "UNSUPPORTED", addressClassification: "UNSUPPORTED", providerLegalApproval: "UNSUPPORTED", commercialRedistribution: "UNSUPPORTED", canonicalM5: "UNSUPPORTED" });

function diagnostic(code: M5HolderAdapterDiagnosticCode): readonly M5HolderAdapterDiagnosticCode[] {
  return freeze([code]);
}

function parseReceipt(value: unknown): M5HolderPageReceipt {
  const root = object(value, "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  exact(root, ["receivedAt", "providerPublishedAt"], "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  const receivedAt = timestamp(root.receivedAt, "M5_HOLDER_ADAPTER_TIME_INVALID");
  const providerPublishedAt = root.providerPublishedAt === undefined ? undefined : timestamp(root.providerPublishedAt, "M5_HOLDER_ADAPTER_TIME_INVALID");
  if (providerPublishedAt !== undefined && providerPublishedAt > receivedAt) throw new Error("M5_HOLDER_ADAPTER_TIME_INVALID");
  return freeze({ receivedAt, ...(providerPublishedAt === undefined ? {} : { providerPublishedAt }) });
}

function parseFinality(value: unknown): M5HolderFinalityReference {
  const root = object(value, "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  exact(root, ["referenceBlockNumber", "referenceBlockHash", "observedAt", "receivedAt"], "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  const observedAt = timestamp(root.observedAt, "M5_HOLDER_ADAPTER_TIME_INVALID");
  const receivedAt = timestamp(root.receivedAt, "M5_HOLDER_ADAPTER_TIME_INVALID");
  if (observedAt > receivedAt) throw new Error("M5_HOLDER_ADAPTER_TIME_INVALID");
  return freeze({ referenceBlockNumber: atoms(root.referenceBlockNumber, "M5_HOLDER_ADAPTER_BLOCK_MISMATCH", UINT64_MAX), referenceBlockHash: blockHash(root.referenceBlockHash, "M5_HOLDER_ADAPTER_BLOCK_MISMATCH"), observedAt, receivedAt });
}

function pageMaterial(page: Omit<M5ParsedHolderPage, "payloadFingerprint" | "fixtureVersion">): Obj {
  // Payload identity excludes observation/availability receipts. A replay of
  // the same response at a later time therefore keeps the same payload hash.
  return { providerId: page.providerId, datasetId: page.datasetId, datasetVersion: page.datasetVersion, providerSourceNamespace: page.providerSourceNamespace, chainId: page.chainId, contractAddress: page.contractAddress, snapshotBlockNumber: page.snapshotBlockNumber.toString(), snapshotBlockHash: page.snapshotBlockHash, snapshotBlockTimestamp: page.snapshotBlockTimestamp, tokenDecimals: page.tokenDecimals, totalSupplyAtoms: page.totalSupplyAtoms.toString(), declaredHolderCount: page.declaredHolderCount, declaredPageCount: page.declaredPageCount, pageOrdinal: page.pageOrdinal, isFinal: page.isFinal, ...(page.nextPageState === undefined ? {} : { nextPageState: page.nextPageState }), holders: page.holders.map(holder => ({ itemOrdinal: holder.itemOrdinal, address: holder.address, balanceAtoms: holder.balanceAtoms.toString() })), sourceRecordId: page.sourceRecordId, finality: { referenceBlockNumber: page.finality.referenceBlockNumber.toString(), referenceBlockHash: page.finality.referenceBlockHash, observedAt: page.finality.observedAt } };
}

export function holderPagePayloadFingerprint(page: Omit<M5ParsedHolderPage, "payloadFingerprint" | "fixtureVersion">): string {
  return canonicalSha256({ adapterContractVersion: M5_HOLDER_SNAPSHOT_ADAPTER_VERSION, parserContractVersion: M5_HOLDER_PAGE_FIXTURE_VERSION, ...pageMaterial(page) });
}

export function buildM5HolderSnapshotRequestPlan(input: Readonly<{ providerId: string; datasetId: string; datasetVersion: string; providerSourceNamespace: string; contractAddress: string; pageSize: number; asOf: string }>): M5HolderSnapshotRequestPlan {
  return freeze({ providerId: text(input.providerId, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), datasetId: text(input.datasetId, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), datasetVersion: text(input.datasetVersion, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), providerSourceNamespace: text(input.providerSourceNamespace, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), adapterContractVersion: M5_HOLDER_SNAPSHOT_ADAPTER_VERSION, parserContractVersion: M5_HOLDER_PAGE_FIXTURE_VERSION, chainId: M5_ETHEREUM_CHAIN_ID, contractAddress: address(input.contractAddress, "M5_HOLDER_ADAPTER_SCOPE_MISMATCH"), requestedBlockStrategy: "PINNED_SNAPSHOT_BLOCK", supplyBasis: "TOTAL_SUPPLY", addressPolicy: "INCLUDE_ALL", pageSize: integer(input.pageSize, "M5_HOLDER_ADAPTER_SCHEMA_INVALID", 1), finalityPolicyVersion: M5_HOLDER_FINALITY_POLICY_VERSION, asOf: timestamp(input.asOf, "M5_HOLDER_ADAPTER_TIME_INVALID") });
}

export function parseM5HolderPageFixture(input: unknown): M5ParsedHolderPage {
  const root = object(input, "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  exact(root, ["fixtureVersion", "providerId", "datasetId", "datasetVersion", "providerSourceNamespace", "chainId", "contractAddress", "snapshotBlockNumber", "snapshotBlockHash", "snapshotBlockTimestamp", "tokenDecimals", "totalSupplyAtoms", "declaredHolderCount", "declaredPageCount", "pageOrdinal", "isFinal", "nextPageState", "holders", "receipt", "sourceRecordId", "payloadFingerprint", "finality"], "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  if (root.fixtureVersion !== M5_HOLDER_PAGE_FIXTURE_VERSION) throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  const holdersValue = root.holders;
  if (!Array.isArray(holdersValue)) throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  const holders = holdersValue.map(value => {
    const holder = object(value, "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
    exact(holder, ["itemOrdinal", "address", "balanceAtoms"], "M5_HOLDER_ADAPTER_SCHEMA_INVALID");
    return { itemOrdinal: integer(holder.itemOrdinal, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), address: address(holder.address, "M5_HOLDER_ADAPTER_SCOPE_MISMATCH"), balanceAtoms: atoms(holder.balanceAtoms, "M5_HOLDER_ADAPTER_SCHEMA_INVALID") };
  }).sort((a, b) => a.itemOrdinal - b.itemOrdinal);
  if (holders.some((holder, index) => holder.itemOrdinal !== index) || new Set(holders.map(holder => holder.itemOrdinal)).size !== holders.length || new Set(holders.map(holder => holder.address)).size !== holders.length) throw new Error("M5_HOLDER_ADAPTER_DUPLICATE");
  const nextPageState = root.nextPageState === undefined ? undefined : (() => { const state = object(root.nextPageState, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"); exact(state, ["kind", "nextPageOrdinal"], "M5_HOLDER_ADAPTER_SCHEMA_INVALID"); if (state.kind === "NONE") return { kind: "NONE" as const }; if (state.kind !== "MORE") throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID"); return { kind: "MORE" as const, nextPageOrdinal: integer(state.nextPageOrdinal, "M5_HOLDER_ADAPTER_SCHEMA_INVALID") }; })();
  if (nextPageState?.kind === "MORE" && nextPageState.nextPageOrdinal <= integer(root.pageOrdinal, "M5_HOLDER_ADAPTER_SCHEMA_INVALID")) throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  const page = { fixtureVersion: M5_HOLDER_PAGE_FIXTURE_VERSION, providerId: text(root.providerId, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), datasetId: text(root.datasetId, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), datasetVersion: text(root.datasetVersion, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), providerSourceNamespace: text(root.providerSourceNamespace, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), chainId: root.chainId === M5_ETHEREUM_CHAIN_ID ? M5_ETHEREUM_CHAIN_ID : (() => { throw new Error("M5_HOLDER_ADAPTER_SCOPE_MISMATCH"); })(), contractAddress: address(root.contractAddress, "M5_HOLDER_ADAPTER_SCOPE_MISMATCH"), snapshotBlockNumber: atoms(root.snapshotBlockNumber, "M5_HOLDER_ADAPTER_BLOCK_MISMATCH", UINT64_MAX), snapshotBlockHash: blockHash(root.snapshotBlockHash, "M5_HOLDER_ADAPTER_BLOCK_MISMATCH"), snapshotBlockTimestamp: timestamp(root.snapshotBlockTimestamp, "M5_HOLDER_ADAPTER_TIME_INVALID"), tokenDecimals: integer(root.tokenDecimals, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), totalSupplyAtoms: atoms(root.totalSupplyAtoms, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), declaredHolderCount: integer(root.declaredHolderCount, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), declaredPageCount: integer(root.declaredPageCount, "M5_HOLDER_ADAPTER_SCHEMA_INVALID", 1), pageOrdinal: integer(root.pageOrdinal, "M5_HOLDER_ADAPTER_SCHEMA_INVALID"), isFinal: root.isFinal === true ? true : root.isFinal === false ? false : (() => { throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID"); })(), ...(nextPageState === undefined ? {} : { nextPageState }), holders: freeze(holders), receipt: parseReceipt(root.receipt), sourceRecordId: text(root.sourceRecordId, "M5_HOLDER_ADAPTER_FINGERPRINT_INVALID"), payloadFingerprint: sha(root.payloadFingerprint, "M5_HOLDER_ADAPTER_FINGERPRINT_INVALID"), finality: parseFinality(root.finality) };
  if (page.snapshotBlockNumber === 0n || page.totalSupplyAtoms === 0n || page.tokenDecimals > 36 || page.declaredHolderCount < page.holders.length) throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID");
  if (page.finality.referenceBlockNumber < page.snapshotBlockNumber || page.finality.referenceBlockHash === "" || page.finality.observedAt < page.snapshotBlockTimestamp || page.finality.receivedAt < page.receipt.receivedAt) throw new Error("M5_HOLDER_ADAPTER_BLOCK_MISMATCH");
  if (page.snapshotBlockTimestamp > page.receipt.receivedAt) throw new Error("M5_HOLDER_ADAPTER_TIME_INVALID");
  const expectedFingerprint = holderPagePayloadFingerprint(page);
  if (page.payloadFingerprint !== expectedFingerprint) throw new Error("M5_HOLDER_ADAPTER_FINGERPRINT_INVALID");
  return freeze(page);
}

function classify(error: unknown): M5HolderAdapterDiagnosticCode {
  const code = error instanceof Error ? error.message : "M5_HOLDER_ADAPTER_SCHEMA_INVALID";
  return (code.startsWith("M5_HOLDER_ADAPTER_") ? code : "M5_HOLDER_ADAPTER_SCHEMA_INVALID") as M5HolderAdapterDiagnosticCode;
}

function diagnostics(code: M5HolderAdapterDiagnosticCode): readonly M5HolderAdapterDiagnosticCode[] {
  return diagnostic(code);
}

export function assembleM5HolderPageSet(input: Readonly<{ request: M5HolderSnapshotRequestPlan; pages: readonly unknown[] }>): M5HolderPageSetResult {
  try {
    const pages = input.pages.map(parseM5HolderPageFixture).sort((a, b) => a.pageOrdinal - b.pageOrdinal);
    if (pages.length === 0) throw new Error("M5_HOLDER_ADAPTER_INCOMPLETE_PAGINATION");
    const first = pages[0]!;
    if (pages.length !== first.declaredPageCount || pages.some((page, index) => page.pageOrdinal !== index)) throw new Error("M5_HOLDER_ADAPTER_INCOMPLETE_PAGINATION");
    if (pages.some(page => page.declaredPageCount !== first.declaredPageCount || page.declaredHolderCount !== first.declaredHolderCount || page.providerId !== input.request.providerId || page.datasetId !== input.request.datasetId || page.datasetVersion !== input.request.datasetVersion || page.providerSourceNamespace !== input.request.providerSourceNamespace || page.chainId !== first.chainId || page.contractAddress !== first.contractAddress || page.snapshotBlockNumber !== first.snapshotBlockNumber || page.snapshotBlockHash !== first.snapshotBlockHash || page.snapshotBlockTimestamp !== first.snapshotBlockTimestamp || page.tokenDecimals !== first.tokenDecimals || page.totalSupplyAtoms !== first.totalSupplyAtoms)) throw new Error("M5_HOLDER_ADAPTER_SCOPE_MISMATCH");
    if (pages.filter(page => page.isFinal).length !== 1 || !pages.at(-1)!.isFinal || pages.some(page => page.isFinal && page !== pages.at(-1))) throw new Error("M5_HOLDER_ADAPTER_INCOMPLETE_PAGINATION");
    if (new Set(pages.map(page => page.sourceRecordId)).size !== pages.length) throw new Error("M5_HOLDER_ADAPTER_DUPLICATE");
    const allHolders = pages.flatMap(page => page.holders.map(holder => ({ ...holder, pageOrdinal: page.pageOrdinal, sourceRecordId: page.sourceRecordId })));
    if (new Set(allHolders.map(holder => holder.address)).size !== allHolders.length || allHolders.length !== first.declaredHolderCount) throw new Error("M5_HOLDER_ADAPTER_COUNT_MISMATCH");
    const reference = first.finality;
    if (pages.some(page => page.finality.referenceBlockNumber !== reference.referenceBlockNumber || page.finality.referenceBlockHash !== reference.referenceBlockHash || page.finality.observedAt !== reference.observedAt || page.finality.receivedAt !== reference.receivedAt)) throw new Error("M5_HOLDER_ADAPTER_BLOCK_MISMATCH");
    const finalityDepthBig = reference.referenceBlockNumber - first.snapshotBlockNumber;
    if (finalityDepthBig < 12n) throw new Error("M5_HOLDER_ADAPTER_FINALITY_INSUFFICIENT");
    if (finalityDepthBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("M5_HOLDER_ADAPTER_SCHEMA_INVALID");
    const effectiveAvailableAt = [reference.receivedAt, ...pages.map(page => page.receipt.receivedAt)].sort().at(-1)!;
    if (effectiveAvailableAt > input.request.asOf || pages.some(page => page.finality.observedAt > input.request.asOf)) throw new Error("M5_HOLDER_ADAPTER_TIME_INVALID");
    return freeze({ status: "COMPLETE", request: input.request, pages: freeze(pages), effectiveAvailableAt, finalityDepth: Number(finalityDepthBig), diagnostics: freeze([] as const) });
  } catch (error) {
    const code = classify(error);
    const incomplete = new Set<M5HolderAdapterDiagnosticCode>(["M5_HOLDER_ADAPTER_INCOMPLETE_PAGINATION", "M5_HOLDER_ADAPTER_FINALITY_INSUFFICIENT"]);
    return freeze({ status: incomplete.has(code) ? "INCOMPLETE" : "INVALID", diagnostics: diagnostics(code), capabilities });
  }
}

function projectPageToPackageRecord(page: M5ParsedHolderPage, effectiveAvailableAt: string, recordedAt: string): Obj {
  const holderItems = Object.fromEntries(page.holders.map(holder => [String(holder.itemOrdinal), { itemOrdinal: holder.itemOrdinal, address: holder.address, balanceAtoms: holder.balanceAtoms.toString() }]));
  const envelope = { adapterContractVersion: M5_HOLDER_SNAPSHOT_ADAPTER_VERSION, parserContractVersion: M5_HOLDER_PAGE_FIXTURE_VERSION, providerId: page.providerId, datasetId: page.datasetId, datasetVersion: page.datasetVersion, providerSourceNamespace: page.providerSourceNamespace, chainId: page.chainId, contractAddress: page.contractAddress, observationType: "HOLDER_SNAPSHOT_PAGE", pageOrdinal: page.pageOrdinal, isFinal: page.isFinal, snapshotBlockNumber: page.snapshotBlockNumber.toString(), snapshotBlockHash: page.snapshotBlockHash, snapshotBlockTimestamp: page.snapshotBlockTimestamp, decimals: page.tokenDecimals, totalSupplyAtoms: page.totalSupplyAtoms.toString(), declaredHolderCount: page.declaredHolderCount, declaredPageCount: page.declaredPageCount, holderItems, pageReceiptAt: page.receipt.receivedAt, ...(page.receipt.providerPublishedAt === undefined ? {} : { providerPublishedAt: page.receipt.providerPublishedAt }), effectiveAvailableAt, finality: { referenceBlockNumber: page.finality.referenceBlockNumber.toString(), referenceBlockHash: page.finality.referenceBlockHash, observedAt: page.finality.observedAt, receivedAt: page.finality.receivedAt } };
  return { providerExternalRecordId: page.sourceRecordId, payloadFingerprint: page.payloadFingerprint, pageOrdinal: page.pageOrdinal, itemOrdinal: 0, retrievedAt: effectiveAvailableAt, recordedAt, observedAt: page.snapshotBlockTimestamp, ...(page.receipt.providerPublishedAt === undefined ? {} : { providerPublishedAt: page.receipt.providerPublishedAt }), normalizedEnvelope: envelope, selectedAuditableFields: { metric: "HOLDER_SNAPSHOT_PAGE", pageOrdinal: page.pageOrdinal, pageReceiptAt: page.receipt.receivedAt, effectiveAvailableAt, finalityReceiptAt: page.finality.receivedAt }, metadata: { pageOrdinal: page.pageOrdinal, cursorSafety: "NONE" } };
}

export function projectM5HolderPageSetToNormalizedPackage(input: Readonly<{ pageSet: Extract<M5HolderPageSetResult, { status: "COMPLETE" }>; idempotencyKey: string; requestedAt: string; startedAt: string; recordedAt: string }>): ManualNormalizedSourcePackage {
  const records = input.pageSet.pages.map(page => projectPageToPackageRecord(page, input.pageSet.effectiveAvailableAt, input.recordedAt));
  return parseM5NormalizedSourcePackage({ contractVersion: M5_NORMALIZED_SOURCE_PACKAGE_VERSION, idempotencyKey: input.idempotencyKey, providerId: input.pageSet.request.providerId, datasetId: input.pageSet.request.datasetId, datasetVersion: input.pageSet.request.datasetVersion, providerSourceNamespace: input.pageSet.request.providerSourceNamespace, adapterContractVersion: M5_HOLDER_SNAPSHOT_ADAPTER_VERSION, adapterVersion: M5_HOLDER_SNAPSHOT_ADAPTER_VERSION, parserContractVersion: M5_HOLDER_PAGE_FIXTURE_VERSION, parserVersion: M5_HOLDER_PAGE_FIXTURE_VERSION, envelopeSchemaVersion: "m5-holder-snapshot-envelope/v1", attemptNumber: 1, requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt, requestScope: { chainId: M5_ETHEREUM_CHAIN_ID, contractAddress: input.pageSet.request.contractAddress, supplyBasis: "TOTAL_SUPPLY", addressPolicy: "INCLUDE_ALL" }, provenance: { system: "m5-holder-snapshot-fixture", reviewReference: M5_HOLDER_FINALITY_POLICY_VERSION }, executionInput: { execution: "FIXTURE_ONLY", requestedBlockStrategy: "PINNED_SNAPSHOT_BLOCK", pageSize: input.pageSet.request.pageSize, availabilityPolicy: "m5-provider-availability-policy/v1", finalityPolicy: M5_HOLDER_FINALITY_POLICY_VERSION }, records });
}

export function projectM5HolderPageSetToSnapshot(input: Readonly<{ pageSet: Extract<M5HolderPageSetResult, { status: "COMPLETE" }>; asOf: string; recordedAt: string }>): M5HolderSnapshotAdapterResult {
  try {
    const pageSet = input.pageSet;
    const first = pageSet.pages[0]!;
    const pages: readonly M5HolderPage[] = pageSet.pages.map(page => freeze({ pageOrdinal: page.pageOrdinal, itemCount: page.holders.length, isFinal: page.isFinal, blockNumber: page.snapshotBlockNumber, blockHash: page.snapshotBlockHash, tokenDecimals: page.tokenDecimals, sourceRecordIds: freeze([page.sourceRecordId]), payloadFingerprint: page.payloadFingerprint }));
    const holders = pageSet.pages.flatMap(page => page.holders.map(holder => ({ address: holder.address, balanceAtoms: holder.balanceAtoms, inclusionState: "INCLUDED" as const, sourceRecordId: page.sourceRecordId, sourcePageOrdinal: page.pageOrdinal, sourceItemOrdinal: holder.itemOrdinal, ordinal: 0 })));
    const snapshot = createM5HolderSnapshot({ providerId: first.providerId, datasetId: first.datasetId, datasetVersion: first.datasetVersion, sourceLineageId: "UNBOUND_FIXTURE", sourceLineageBinding: "UNBOUND_FIXTURE", chainId: M5_ETHEREUM_CHAIN_ID, contractAddress: first.contractAddress, blockNumber: first.snapshotBlockNumber, blockHash: first.snapshotBlockHash, blockTimestamp: first.snapshotBlockTimestamp, finalityStatus: "CONFIRMED", finalityDepth: pageSet.finalityDepth, tokenDecimals: first.tokenDecimals, supplyBasis: "TOTAL_SUPPLY", addressPolicy: "INCLUDE_ALL", denominatorAtoms: first.totalSupplyAtoms, declaredHolderCount: first.declaredHolderCount, fullPaginationProof: { pageCount: pages.length, finalPageOrdinal: pages.length - 1, pages }, holders, materialSourceRecordIds: pages.flatMap(page => page.sourceRecordIds), payloadFingerprints: pages.map(page => page.payloadFingerprint), observedAt: first.snapshotBlockTimestamp, availableAt: pageSet.effectiveAvailableAt, recordedAt: input.recordedAt });
    const concentration = deriveM5HolderConcentration(snapshot, input.asOf);
    if (concentration.status !== "READY") return freeze({ status: concentration.status, diagnostics: ["M5_HOLDER_ADAPTER_TIME_INVALID"], capabilities });
    const normalizedPackage = projectM5HolderPageSetToNormalizedPackage({ pageSet, idempotencyKey: snapshot.snapshotId, requestedAt: first.snapshotBlockTimestamp, startedAt: first.snapshotBlockTimestamp, recordedAt: input.recordedAt });
    return freeze({ status: "COMPLETE", request: pageSet.request, pages: pageSet.pages, effectiveAvailableAt: pageSet.effectiveAvailableAt, finalityDepth: pageSet.finalityDepth, snapshot, concentration, normalizedPackage, capabilities, diagnostics: freeze([] as const) });
  } catch (error) {
    return freeze({ status: "INVALID", diagnostics: diagnostics(classify(error)), capabilities });
  }
}
