import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import { ceilingDivision } from "@/domain/financial/rounding";

export const M5_HOLDER_SNAPSHOT_CONTRACT_VERSION = "m5-holder-snapshot/v1" as const;
export const M5_HOLDER_SNAPSHOT_FIXTURE_VERSION = "m5-holder-snapshot-fixture/v1" as const;
export const M5_CONCENTRATION_POLICY_VERSION = "m5-concentration-policy/v1" as const;
export const M5_ETHEREUM_CHAIN_ID = "eip155:1" as const;
export const M5_HOLDER_SUPPLY_BASIS = "TOTAL_SUPPLY" as const;
export const M5_HOLDER_ADDRESS_POLICY = "INCLUDE_ALL" as const;
export const M5_CONCENTRATION_SCALE = 0 as const;
export const M5_CONCENTRATION_UNIT = "BPS" as const;
export const M5_MIN_FINALITY_DEPTH = 12;

const SHA256 = /^[a-f0-9]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BLOCK_HASH = /^0x[0-9a-fA-F]{64}$/;
const CHAIN = /^eip155:[1-9][0-9]*$/;
const ATOM = /^(?:0|[1-9][0-9]*)$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INT64_MAX = (1n << 63n) - 1n;
const UINT32_MAX = 4_294_967_295;

type Obj = Record<string, unknown>;

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

const exact = (value: Obj, keys: readonly string[], code: string): void => {
  const allowed = new Set(keys);
  if (Object.keys(value).some(key => {
    if (allowed.has(key)) return false;
    if (/(api[_-]?key|authorization|cookie|password|secret|token|signed|url)/i.test(key)) throw new Error("M5_HOLDER_SECRET_FIELD_REJECTED");
    return true;
  })) throw new Error(code);
};

const text = (value: unknown, code: string, max = 512): string => {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > max) throw new Error(code);
  return value;
};

const sha = (value: unknown, code: string): string => {
  const result = text(value, code, 64);
  if (!SHA256.test(result)) throw new Error(code);
  return result;
};

const time = (value: unknown, code: string): string => {
  const result = normalizeIngestionTimestamp(value, code);
  if (!UTC.test(result)) throw new Error(code);
  return result;
};

const safeInteger = (value: unknown, code: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > UINT32_MAX) throw new Error(code);
  return value as number;
};

const atom = (value: unknown, code: string): bigint => {
  const result = text(value, code, 64);
  if (!ATOM.test(result)) throw new Error(code);
  const parsed = BigInt(result);
  if (parsed > INT64_MAX) throw new Error(code);
  return parsed;
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

const chainId = (value: unknown, code: string): string => {
  const result = text(value, code, 32);
  if (!CHAIN.test(result)) throw new Error(code);
  if (result !== M5_ETHEREUM_CHAIN_ID) throw new Error(code);
  return result;
};

export type M5HolderInclusionState = "INCLUDED" | "EXPLICITLY_EXCLUDED";
export type M5HolderFinalityStatus = "CONFIRMED" | "FINALIZED";

export type M5HolderClassificationReference = Readonly<{
  classificationId: string;
  fingerprint: string;
}>;

export type M5HolderEntry = Readonly<{
  address: string;
  balanceAtoms: bigint;
  inclusionState: M5HolderInclusionState;
  classificationReference?: M5HolderClassificationReference;
  sourceRecordId: string;
  sourcePageOrdinal: number;
  sourceItemOrdinal: number;
  ordinal: number;
}>;

export type M5HolderPage = Readonly<{
  pageOrdinal: number;
  itemCount: number;
  isFinal: boolean;
  blockNumber: bigint;
  blockHash: string;
  tokenDecimals: number;
  sourceRecordIds: readonly string[];
  payloadFingerprint: string;
}>;

export type M5HolderPaginationProof = Readonly<{
  pageCount: number;
  finalPageOrdinal: number;
  pages: readonly M5HolderPage[];
}>;

export type M5HolderSnapshot = Readonly<{
  contractVersion: typeof M5_HOLDER_SNAPSHOT_CONTRACT_VERSION;
  snapshotId: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  sourceLineageId: string;
  sourceLineageBinding: "BOUND" | "UNBOUND_FIXTURE";
  chainId: typeof M5_ETHEREUM_CHAIN_ID;
  contractAddress: string;
  blockNumber: bigint;
  blockHash: string;
  blockTimestamp: string;
  finalityStatus: M5HolderFinalityStatus;
  finalityDepth: number;
  tokenDecimals: number;
  supplyBasis: typeof M5_HOLDER_SUPPLY_BASIS;
  addressPolicy: typeof M5_HOLDER_ADDRESS_POLICY;
  denominatorAtoms: bigint;
  declaredHolderCount: number;
  fullPaginationProof: M5HolderPaginationProof;
  holders: readonly M5HolderEntry[];
  materialSourceRecordIds: readonly string[];
  payloadFingerprints: readonly string[];
  observedAt: string;
  availableAt: string;
  fingerprint: string;
  recordedAt: string;
}>;

export type M5ConcentrationMaterial = Readonly<{
  metricKind: "SINGLE_CONCENTRATION" | "TOP10_CONCENTRATION";
  valueAtoms: bigint;
  scale: 0;
  unit: "BPS";
  policyVersion: typeof M5_CONCENTRATION_POLICY_VERSION;
  snapshotId: string;
  snapshotFingerprint: string;
  orderedMaterialSourceRecordIds: readonly string[];
}>;

export type M5HolderConcentrationResult =
  | Readonly<{ status: "READY"; snapshot: M5HolderSnapshot; single: M5ConcentrationMaterial; top10: M5ConcentrationMaterial; diagnostics: readonly [] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5HolderDiagnosticCode[] }>;

export type M5HolderFixtureResult =
  | Readonly<{ status: "READY"; snapshot: M5HolderSnapshot; diagnostics: readonly [] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5HolderDiagnosticCode[] }>;

export type M5HolderDiagnosticCode =
  | "M5_HOLDER_SNAPSHOT_EMPTY"
  | "M5_HOLDER_PAGINATION_INCOMPLETE"
  | "M5_HOLDER_FINALITY_INSUFFICIENT"
  | "M5_HOLDER_EXCLUSIONS_UNSUPPORTED"
  | "M5_HOLDER_SUPPLY_BASIS_UNSUPPORTED"
  | "M5_HOLDER_SCHEMA_INVALID"
  | "M5_HOLDER_IDENTITY_INVALID"
  | "M5_HOLDER_DUPLICATE"
  | "M5_HOLDER_COUNT_MISMATCH"
  | "M5_HOLDER_BLOCK_MISMATCH"
  | "M5_HOLDER_DECIMALS_MISMATCH"
  | "M5_HOLDER_SUPPLY_RECONCILIATION_INVALID"
  | "M5_HOLDER_TIME_INVALID"
  | "M5_HOLDER_FINGERPRINT_INVALID"
  | "M5_HOLDER_RANGE_INVALID"
  | "M5_HOLDER_SECRET_FIELD_REJECTED";

type SnapshotMaterial = Omit<M5HolderSnapshot, "contractVersion" | "snapshotId" | "fingerprint" | "recordedAt">;
export type M5HolderSnapshotInput = SnapshotMaterial & Readonly<{ recordedAt: string; snapshotId?: string; fingerprint?: string }>;

function sortUnique(values: readonly string[], code: M5HolderDiagnosticCode): readonly string[] {
  if (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.trim() !== value || value.length === 0)) throw new Error(code);
  const sorted = [...values].sort((a, b) => a.localeCompare(b));
  if (new Set(sorted).size !== sorted.length) throw new Error(code);
  return freeze(sorted);
}

function material(input: SnapshotMaterial | (SnapshotMaterial & Readonly<{ snapshotId?: string; fingerprint?: string; recordedAt?: string }>)): SnapshotMaterial {
  const value = { ...(input as SnapshotMaterial & Readonly<{ snapshotId?: string; fingerprint?: string; recordedAt?: string }>) } as SnapshotMaterial & Record<string, unknown>;
  delete value.snapshotId;
  delete value.fingerprint;
  delete value.recordedAt;
  const pages = [...value.fullPaginationProof.pages].sort((a, b) => a.pageOrdinal - b.pageOrdinal).map(page => ({ ...page, sourceRecordIds: [...page.sourceRecordIds].sort() }));
  const holders = [...value.holders].sort((a, b) => a.balanceAtoms > b.balanceAtoms ? -1 : a.balanceAtoms < b.balanceAtoms ? 1 : a.address.localeCompare(b.address)).map((holder, ordinal) => ({ ...holder, ordinal }));
  return freeze({ ...value, holders: freeze(holders), materialSourceRecordIds: freeze([...value.materialSourceRecordIds].sort()), payloadFingerprints: freeze([...value.payloadFingerprints].sort()), fullPaginationProof: freeze({ ...value.fullPaginationProof, pages: freeze(pages) }) });
}

export function m5HolderSnapshotIdFor(input: SnapshotMaterial): string {
  return `m5-holder-snapshot:${canonicalSha256({ contractVersion: M5_HOLDER_SNAPSHOT_CONTRACT_VERSION, policyVersion: M5_CONCENTRATION_POLICY_VERSION, ...input })}`;
}

export function m5HolderSnapshotFingerprint(input: SnapshotMaterial): string {
  const normalized = material(input);
  return canonicalSha256({ contractVersion: M5_HOLDER_SNAPSHOT_CONTRACT_VERSION, policyVersion: M5_CONCENTRATION_POLICY_VERSION, snapshotId: m5HolderSnapshotIdFor(normalized), ...normalized });
}

function validateSnapshotInput(input: SnapshotMaterial): SnapshotMaterial {
  if (input.chainId !== M5_ETHEREUM_CHAIN_ID || !ADDRESS.test(input.contractAddress) || input.contractAddress !== input.contractAddress.toLowerCase()) throw new Error("M5_HOLDER_IDENTITY_INVALID");
  if (!input.providerId || !input.datasetId || !input.datasetVersion || !input.sourceLineageId) throw new Error("M5_HOLDER_SCHEMA_INVALID");
  if (!BLOCK_HASH.test(input.blockHash) || input.blockHash !== input.blockHash.toLowerCase() || input.blockNumber < 0n || input.blockNumber > INT64_MAX) throw new Error("M5_HOLDER_BLOCK_MISMATCH");
  time(input.blockTimestamp, "M5_HOLDER_TIME_INVALID");
  time(input.observedAt, "M5_HOLDER_TIME_INVALID");
  time(input.availableAt, "M5_HOLDER_TIME_INVALID");
  if (input.tokenDecimals < 0 || input.tokenDecimals > 36 || !Number.isSafeInteger(input.tokenDecimals)) throw new Error("M5_HOLDER_RANGE_INVALID");
  if ((input.finalityStatus !== "CONFIRMED" && input.finalityStatus !== "FINALIZED") || !Number.isSafeInteger(input.finalityDepth) || input.finalityDepth < 0) throw new Error("M5_HOLDER_FINALITY_INSUFFICIENT");
  if (input.finalityStatus !== "FINALIZED" && input.finalityDepth < M5_MIN_FINALITY_DEPTH) throw new Error("M5_HOLDER_FINALITY_INSUFFICIENT");
  if (input.supplyBasis !== M5_HOLDER_SUPPLY_BASIS) throw new Error("M5_HOLDER_SUPPLY_BASIS_UNSUPPORTED");
  if (input.addressPolicy !== M5_HOLDER_ADDRESS_POLICY) throw new Error("M5_HOLDER_EXCLUSIONS_UNSUPPORTED");
  if (input.denominatorAtoms <= 0n || input.denominatorAtoms > INT64_MAX) throw new Error("M5_HOLDER_RANGE_INVALID");
  if (input.declaredHolderCount !== input.holders.length) throw new Error("M5_HOLDER_COUNT_MISMATCH");
  if (input.blockTimestamp > input.observedAt || input.observedAt > input.availableAt) throw new Error("M5_HOLDER_TIME_INVALID");
  if (input.materialSourceRecordIds.length === 0 || input.payloadFingerprints.length === 0) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
  if ((input.sourceLineageBinding !== "BOUND" && input.sourceLineageBinding !== "UNBOUND_FIXTURE") || (input.sourceLineageBinding === "UNBOUND_FIXTURE" && input.sourceLineageId !== "UNBOUND_FIXTURE") || (input.sourceLineageBinding === "BOUND" && input.sourceLineageId === "UNBOUND_FIXTURE")) throw new Error("M5_HOLDER_SCHEMA_INVALID");
  const pages = input.fullPaginationProof.pages;
  if (pages.length === 0 || input.fullPaginationProof.pageCount !== pages.length || input.fullPaginationProof.finalPageOrdinal !== pages.length - 1 || pages.some((page, index) => page.pageOrdinal !== index) || pages.filter(page => page.isFinal).length !== 1 || !pages[pages.length - 1]!.isFinal) throw new Error("M5_HOLDER_PAGINATION_INCOMPLETE");
  const pageSourceIds = pages.flatMap(page => page.sourceRecordIds);
  if (new Set(pageSourceIds).size !== pageSourceIds.length || JSON.stringify([...pageSourceIds].sort()) !== JSON.stringify([...input.materialSourceRecordIds].sort())) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
  if (input.materialSourceRecordIds.some(id => typeof id !== "string" || id.trim() !== id || id.length === 0) || input.payloadFingerprints.some(value => !SHA256.test(value)) || new Set(input.materialSourceRecordIds).size !== input.materialSourceRecordIds.length || new Set(input.payloadFingerprints).size !== input.payloadFingerprints.length) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
  if (JSON.stringify(pages.map(page => page.payloadFingerprint).sort()) !== JSON.stringify([...input.payloadFingerprints].sort())) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
  const itemKeys = new Set<string>();
  const pageCounts = new Map<number, number>();
  const total = input.holders.reduce((sum, holder) => {
    if (!ADDRESS.test(holder.address) || holder.address !== holder.address.toLowerCase() || !holder.sourceRecordId.trim() || !Number.isSafeInteger(holder.sourcePageOrdinal) || !Number.isSafeInteger(holder.sourceItemOrdinal) || !Number.isSafeInteger(holder.ordinal)) throw new Error("M5_HOLDER_SCHEMA_INVALID");
    const page = pages[holder.sourcePageOrdinal];
    if (!page || holder.sourceItemOrdinal >= page.itemCount || !page.sourceRecordIds.includes(holder.sourceRecordId)) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
    const itemKey = `${holder.sourcePageOrdinal}:${holder.sourceItemOrdinal}`;
    if (itemKeys.has(itemKey)) throw new Error("M5_HOLDER_DUPLICATE");
    itemKeys.add(itemKey);
    pageCounts.set(holder.sourcePageOrdinal, (pageCounts.get(holder.sourcePageOrdinal) ?? 0) + 1);
    if (holder.inclusionState !== "INCLUDED" || holder.balanceAtoms < 0n || holder.balanceAtoms > INT64_MAX) throw new Error(holder.inclusionState === "EXPLICITLY_EXCLUDED" ? "M5_HOLDER_EXCLUSIONS_UNSUPPORTED" : "M5_HOLDER_RANGE_INVALID");
    return sum + holder.balanceAtoms;
  }, 0n);
  if (new Set(input.holders.map(holder => holder.address)).size !== input.holders.length) throw new Error("M5_HOLDER_DUPLICATE");
  if (pages.some(page => page.itemCount !== (pageCounts.get(page.pageOrdinal) ?? 0))) throw new Error("M5_HOLDER_COUNT_MISMATCH");
  if (total !== input.denominatorAtoms) throw new Error("M5_HOLDER_SUPPLY_RECONCILIATION_INVALID");
  return input;
}

export function createM5HolderSnapshot(input: M5HolderSnapshotInput): M5HolderSnapshot {
  const normalized = validateSnapshotInput(material(input));
  const snapshotId = m5HolderSnapshotIdFor(normalized);
  if (input.snapshotId !== undefined && input.snapshotId !== snapshotId) throw new Error("M5_HOLDER_SNAPSHOT_ID_MISMATCH");
  const fingerprint = m5HolderSnapshotFingerprint(normalized);
  if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) throw new Error("M5_HOLDER_SNAPSHOT_FINGERPRINT_MISMATCH");
  return freeze({ contractVersion: M5_HOLDER_SNAPSHOT_CONTRACT_VERSION, snapshotId, ...normalized, fingerprint, recordedAt: time(input.recordedAt, "M5_HOLDER_TIME_INVALID") });
}

function diagnostics(values: readonly M5HolderDiagnosticCode[]): readonly M5HolderDiagnosticCode[] {
  const order: readonly M5HolderDiagnosticCode[] = ["M5_HOLDER_SNAPSHOT_EMPTY", "M5_HOLDER_PAGINATION_INCOMPLETE", "M5_HOLDER_FINALITY_INSUFFICIENT", "M5_HOLDER_EXCLUSIONS_UNSUPPORTED", "M5_HOLDER_SUPPLY_BASIS_UNSUPPORTED", "M5_HOLDER_SCHEMA_INVALID", "M5_HOLDER_IDENTITY_INVALID", "M5_HOLDER_DUPLICATE", "M5_HOLDER_COUNT_MISMATCH", "M5_HOLDER_BLOCK_MISMATCH", "M5_HOLDER_DECIMALS_MISMATCH", "M5_HOLDER_SUPPLY_RECONCILIATION_INVALID", "M5_HOLDER_TIME_INVALID", "M5_HOLDER_FINGERPRINT_INVALID", "M5_HOLDER_RANGE_INVALID", "M5_HOLDER_SECRET_FIELD_REJECTED"];
  const set = new Set(values);
  return freeze(order.filter(code => set.has(code)));
}

function classify(error: unknown): M5HolderDiagnosticCode {
  const code = error instanceof Error ? error.message : "M5_HOLDER_SCHEMA_INVALID";
  if (code === "M5_HOLDER_SNAPSHOT_ID_MISMATCH" || code === "M5_HOLDER_SNAPSHOT_FINGERPRINT_MISMATCH") return "M5_HOLDER_FINGERPRINT_INVALID";
  return (code.startsWith("M5_HOLDER_") ? code : "M5_HOLDER_SCHEMA_INVALID") as M5HolderDiagnosticCode;
}

export function concentrationBps(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n || numerator > denominator) throw new Error("M5_HOLDER_SUPPLY_RECONCILIATION_INVALID");
  const result = ceilingDivision(numerator * 10_000n, denominator);
  if (result < 0n || result > 10_000n) throw new Error("M5_HOLDER_RANGE_INVALID");
  return result;
}

function deriveSnapshot(snapshot: M5HolderSnapshot, asOfInput: string): M5HolderConcentrationResult {
  try {
    const asOf = time(asOfInput, "M5_HOLDER_TIME_INVALID");
    if (snapshot.availableAt > asOf) return freeze({ status: "INVALID", diagnostics: diagnostics(["M5_HOLDER_TIME_INVALID"]) });
    if (snapshot.finalityStatus !== "FINALIZED" && snapshot.finalityDepth < M5_MIN_FINALITY_DEPTH) return freeze({ status: "INCOMPLETE", diagnostics: diagnostics(["M5_HOLDER_FINALITY_INSUFFICIENT"]) });
    const balances = snapshot.holders.filter(holder => holder.inclusionState === "INCLUDED").sort((a, b) => a.balanceAtoms > b.balanceAtoms ? -1 : a.balanceAtoms < b.balanceAtoms ? 1 : a.address.localeCompare(b.address));
    const single = concentrationBps(balances[0]?.balanceAtoms ?? 0n, snapshot.denominatorAtoms);
    const top10 = concentrationBps(balances.slice(0, 10).reduce((sum, holder) => sum + holder.balanceAtoms, 0n), snapshot.denominatorAtoms);
    const sourceIds = freeze([...snapshot.materialSourceRecordIds]);
    const base = { policyVersion: M5_CONCENTRATION_POLICY_VERSION, snapshotId: snapshot.snapshotId, snapshotFingerprint: snapshot.fingerprint, scale: 0 as const, unit: "BPS" as const, orderedMaterialSourceRecordIds: sourceIds };
    return freeze({ status: "READY", snapshot, single: freeze({ ...base, metricKind: "SINGLE_CONCENTRATION", valueAtoms: single }), top10: freeze({ ...base, metricKind: "TOP10_CONCENTRATION", valueAtoms: top10 }), diagnostics: freeze([] as const) });
  } catch (error) {
    return freeze({ status: "INVALID", diagnostics: diagnostics([classify(error)]) });
  }
}

export function deriveM5HolderConcentration(snapshot: M5HolderSnapshot, asOf: string): M5HolderConcentrationResult {
  return deriveSnapshot(snapshot, asOf);
}

function parsePage(value: unknown): M5HolderPage {
  const page = object(value, "M5_HOLDER_SCHEMA_INVALID");
  exact(page, ["pageOrdinal", "itemCount", "isFinal", "blockNumber", "blockHash", "tokenDecimals", "sourceRecordIds", "payloadFingerprint"], "M5_HOLDER_SCHEMA_INVALID");
  if (typeof page.isFinal !== "boolean") throw new Error("M5_HOLDER_SCHEMA_INVALID");
  return freeze({ pageOrdinal: safeInteger(page.pageOrdinal, "M5_HOLDER_RANGE_INVALID"), itemCount: safeInteger(page.itemCount, "M5_HOLDER_RANGE_INVALID"), isFinal: page.isFinal, blockNumber: atom(page.blockNumber, "M5_HOLDER_BLOCK_MISMATCH"), blockHash: blockHash(page.blockHash, "M5_HOLDER_BLOCK_MISMATCH"), tokenDecimals: safeInteger(page.tokenDecimals, "M5_HOLDER_RANGE_INVALID"), sourceRecordIds: sortUnique(Array.isArray(page.sourceRecordIds) ? page.sourceRecordIds as string[] : [], "M5_HOLDER_FINGERPRINT_INVALID"), payloadFingerprint: sha(page.payloadFingerprint, "M5_HOLDER_FINGERPRINT_INVALID") });
}

export function parseM5HolderSnapshotFixture(fixtureInput: unknown): M5HolderFixtureResult {
  try {
    const root = object(fixtureInput, "M5_HOLDER_SCHEMA_INVALID");
    exact(root, ["fixtureVersion", "providerId", "datasetId", "datasetVersion", "sourceLineageId", "sourceLineageBinding", "chainId", "contractAddress", "blockNumber", "blockHash", "blockTimestamp", "finality", "tokenDecimals", "supplyBasis", "addressPolicy", "denominatorAtoms", "declaredHolderCount", "fullPaginationProof", "holders", "materialSourceRecordIds", "payloadFingerprints", "observedAt", "availableAt", "snapshotId", "snapshotFingerprint", "recordedAt"], "M5_HOLDER_SCHEMA_INVALID");
    if (root.fixtureVersion !== M5_HOLDER_SNAPSHOT_FIXTURE_VERSION) throw new Error("M5_HOLDER_SCHEMA_INVALID");
    const finality = object(root.finality, "M5_HOLDER_SCHEMA_INVALID");
    exact(finality, ["status", "depth"], "M5_HOLDER_SCHEMA_INVALID");
    const finalityStatus = finality.status === "CONFIRMED" || finality.status === "FINALIZED" ? finality.status : (() => { throw new Error("M5_HOLDER_SCHEMA_INVALID"); })();
    const finalityDepth = safeInteger(finality.depth, "M5_HOLDER_RANGE_INVALID");
    const proof = object(root.fullPaginationProof, "M5_HOLDER_SCHEMA_INVALID");
    exact(proof, ["pageCount", "finalPageOrdinal", "pages"], "M5_HOLDER_SCHEMA_INVALID");
    if (!Array.isArray(proof.pages)) throw new Error("M5_HOLDER_PAGINATION_INCOMPLETE");
    const pages = proof.pages.map(parsePage).sort((a, b) => a.pageOrdinal - b.pageOrdinal);
    if (pages.length === 0) throw new Error("M5_HOLDER_PAGINATION_INCOMPLETE");
    if (pages.some((page, index) => page.pageOrdinal !== index) || pages.length !== safeInteger(proof.pageCount, "M5_HOLDER_PAGINATION_INCOMPLETE") || safeInteger(proof.finalPageOrdinal, "M5_HOLDER_PAGINATION_INCOMPLETE") !== pages.length - 1 || pages.filter(page => page.isFinal).length !== 1 || !pages.at(-1)!.isFinal) throw new Error("M5_HOLDER_PAGINATION_INCOMPLETE");
    const pageOrdinals = new Set<number>(); const itemOrdinals = new Set<string>(); const addresses = new Set<string>();
    const holders = Array.isArray(root.holders) ? root.holders.map(value => {
      const holder = object(value, "M5_HOLDER_SCHEMA_INVALID");
      exact(holder, ["address", "balanceAtoms", "inclusionState", "classificationReference", "sourceRecordId", "pageOrdinal", "itemOrdinal"], "M5_HOLDER_SCHEMA_INVALID");
      const pageOrdinal = safeInteger(holder.pageOrdinal, "M5_HOLDER_RANGE_INVALID"); const itemOrdinal = safeInteger(holder.itemOrdinal, "M5_HOLDER_RANGE_INVALID");
      if (!pageOrdinals.has(pageOrdinal)) pageOrdinals.add(pageOrdinal);
      const ordinalKey = `${pageOrdinal}:${itemOrdinal}`; if (itemOrdinals.has(ordinalKey)) throw new Error("M5_HOLDER_DUPLICATE"); itemOrdinals.add(ordinalKey);
      const normalizedAddress = address(holder.address, "M5_HOLDER_IDENTITY_INVALID"); if (addresses.has(normalizedAddress)) throw new Error("M5_HOLDER_DUPLICATE"); addresses.add(normalizedAddress);
      const inclusionState: M5HolderInclusionState = holder.inclusionState === "INCLUDED" || holder.inclusionState === "EXPLICITLY_EXCLUDED" ? holder.inclusionState : (() => { throw new Error("M5_HOLDER_SCHEMA_INVALID"); })();
      const classificationReference = holder.classificationReference === undefined ? undefined : (() => { const ref = object(holder.classificationReference, "M5_HOLDER_SCHEMA_INVALID"); exact(ref, ["classificationId", "fingerprint"], "M5_HOLDER_SCHEMA_INVALID"); return freeze({ classificationId: text(ref.classificationId, "M5_HOLDER_SCHEMA_INVALID"), fingerprint: sha(ref.fingerprint, "M5_HOLDER_FINGERPRINT_INVALID") }); })();
      if (inclusionState === "EXPLICITLY_EXCLUDED" && !classificationReference) throw new Error("M5_HOLDER_EXCLUSIONS_UNSUPPORTED");
      return { address: normalizedAddress, balanceAtoms: atom(holder.balanceAtoms, "M5_HOLDER_RANGE_INVALID"), inclusionState, ...(classificationReference ? { classificationReference } : {}), sourceRecordId: text(holder.sourceRecordId, "M5_HOLDER_FINGERPRINT_INVALID"), sourcePageOrdinal: pageOrdinal, sourceItemOrdinal: itemOrdinal, ordinal: 0 };
    }) : (() => { throw new Error("M5_HOLDER_PAGINATION_INCOMPLETE"); })();
    if (holders.length === 0) throw new Error("M5_HOLDER_SNAPSHOT_EMPTY");
    const sortedHolders = holders.sort((a, b) => a.balanceAtoms > b.balanceAtoms ? -1 : a.balanceAtoms < b.balanceAtoms ? 1 : a.address.localeCompare(b.address)).map((holder, index) => ({ ...holder, ordinal: index }));
    const holderPageCounts = new Map<number, number>(); for (const holder of sortedHolders) holderPageCounts.set(holder.sourcePageOrdinal, (holderPageCounts.get(holder.sourcePageOrdinal) ?? 0) + 1);
    if (pages.some(page => page.itemCount !== (holderPageCounts.get(page.pageOrdinal) ?? 0))) throw new Error("M5_HOLDER_COUNT_MISMATCH");
    const topSourceIds = sortUnique(Array.isArray(root.materialSourceRecordIds) ? root.materialSourceRecordIds as string[] : [], "M5_HOLDER_FINGERPRINT_INVALID");
    const pageSourceIds = pages.flatMap(page => page.sourceRecordIds); if (new Set(pageSourceIds).size !== pageSourceIds.length || JSON.stringify([...pageSourceIds].sort()) !== JSON.stringify(topSourceIds)) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
    const payloadFingerprints = sortUnique(Array.isArray(root.payloadFingerprints) ? root.payloadFingerprints as string[] : [], "M5_HOLDER_FINGERPRINT_INVALID");
    const pagePayloadFingerprints = pages.map(page => page.payloadFingerprint).sort();
    if (JSON.stringify(pagePayloadFingerprints) !== JSON.stringify(payloadFingerprints)) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
    const blockNumber = atom(root.blockNumber, "M5_HOLDER_BLOCK_MISMATCH"); const blockHashValue = blockHash(root.blockHash, "M5_HOLDER_BLOCK_MISMATCH"); const decimals = safeInteger(root.tokenDecimals, "M5_HOLDER_RANGE_INVALID");
    if (pages.some(page => page.blockNumber !== blockNumber || page.blockHash !== blockHashValue)) throw new Error("M5_HOLDER_BLOCK_MISMATCH");
    if (pages.some(page => page.tokenDecimals !== decimals)) throw new Error("M5_HOLDER_DECIMALS_MISMATCH");
    if (sortedHolders.some(holder => !pages[holder.sourcePageOrdinal]!.sourceRecordIds.includes(holder.sourceRecordId))) throw new Error("M5_HOLDER_FINGERPRINT_INVALID");
    const blockTimestamp = time(root.blockTimestamp, "M5_HOLDER_TIME_INVALID");
    const observedAt = time(root.observedAt, "M5_HOLDER_TIME_INVALID");
    const availableAt = time(root.availableAt, "M5_HOLDER_TIME_INVALID");
    if (blockTimestamp > observedAt) throw new Error("M5_HOLDER_TIME_INVALID");
    if (finalityStatus !== "FINALIZED" && finalityDepth < M5_MIN_FINALITY_DEPTH) throw new Error("M5_HOLDER_FINALITY_INSUFFICIENT");
    const sourceLineageBinding: "BOUND" | "UNBOUND_FIXTURE" = root.sourceLineageBinding === "BOUND" || root.sourceLineageBinding === "UNBOUND_FIXTURE" ? root.sourceLineageBinding : (() => { throw new Error("M5_HOLDER_SCHEMA_INVALID"); })();
    const materialInput: SnapshotMaterial & Readonly<{ recordedAt: string }> = { providerId: text(root.providerId, "M5_HOLDER_SCHEMA_INVALID"), datasetId: text(root.datasetId, "M5_HOLDER_SCHEMA_INVALID"), datasetVersion: text(root.datasetVersion, "M5_HOLDER_SCHEMA_INVALID"), sourceLineageId: text(root.sourceLineageId, "M5_HOLDER_SCHEMA_INVALID"), sourceLineageBinding, chainId: chainId(root.chainId, "M5_HOLDER_IDENTITY_INVALID") as typeof M5_ETHEREUM_CHAIN_ID, contractAddress: address(root.contractAddress, "M5_HOLDER_IDENTITY_INVALID"), blockNumber, blockHash: blockHashValue, blockTimestamp, finalityStatus, finalityDepth, tokenDecimals: decimals, supplyBasis: root.supplyBasis === M5_HOLDER_SUPPLY_BASIS ? root.supplyBasis : (() => { throw new Error("M5_HOLDER_SUPPLY_BASIS_UNSUPPORTED"); })(), addressPolicy: root.addressPolicy === M5_HOLDER_ADDRESS_POLICY ? root.addressPolicy : (() => { throw new Error("M5_HOLDER_EXCLUSIONS_UNSUPPORTED"); })(), denominatorAtoms: atom(root.denominatorAtoms, "M5_HOLDER_RANGE_INVALID"), declaredHolderCount: safeInteger(root.declaredHolderCount, "M5_HOLDER_RANGE_INVALID"), fullPaginationProof: freeze({ pageCount: pages.length, finalPageOrdinal: pages.length - 1, pages }), holders: freeze(sortedHolders), materialSourceRecordIds: topSourceIds, payloadFingerprints, observedAt, availableAt, recordedAt: time(root.recordedAt, "M5_HOLDER_TIME_INVALID") };
    const snapshot = createM5HolderSnapshot({ ...materialInput, snapshotId: root.snapshotId === undefined ? undefined : text(root.snapshotId, "M5_HOLDER_FINGERPRINT_INVALID"), fingerprint: root.snapshotFingerprint === undefined ? undefined : sha(root.snapshotFingerprint, "M5_HOLDER_FINGERPRINT_INVALID"), recordedAt: materialInput.recordedAt });
    return freeze({ status: "READY", snapshot, diagnostics: freeze([] as const) });
  } catch (error) {
    const code = classify(error);
    const incomplete = new Set<M5HolderDiagnosticCode>(["M5_HOLDER_PAGINATION_INCOMPLETE", "M5_HOLDER_FINALITY_INSUFFICIENT", "M5_HOLDER_EXCLUSIONS_UNSUPPORTED", "M5_HOLDER_SNAPSHOT_EMPTY"]);
    return freeze({ status: incomplete.has(code) ? "INCOMPLETE" : "INVALID", diagnostics: diagnostics([code]) });
  }
}

export function deriveM5HolderConcentrationFromFixture(input: unknown, asOf: string): M5HolderConcentrationResult {
  const parsed = parseM5HolderSnapshotFixture(input);
  if (parsed.status !== "READY") return parsed;
  return deriveM5HolderConcentration(parsed.snapshot, asOf);
}
