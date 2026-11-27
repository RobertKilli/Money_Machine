import { CURRENCY_REGISTRY } from "@/domain/financial/currency";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import {
  KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES, KRAKEN_PRE_TRADE_PARSER_VERSION,
  parseKrakenPreTradeResponse, type ParsedKrakenPreTradeLevel,
} from "./kraken-pre-trade-parser";
import type { ExternalPaperInstrument, PaperPriceSource } from "./standing-paper-market-price";

export const KRAKEN_PRE_TRADE_EVIDENCE_PACKAGE_VERSION = "kraken-pre-trade-evidence-package/v1" as const;
// Raw JSON escaping can double its UTF-8 byte budget. The allowance covers
// the bounded projection of twenty levels, identities and envelope metadata.
export const KRAKEN_PRE_TRADE_MAX_SERIALIZED_PACKAGE_CHARS = KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES * 2 + 32_768;
const SHA256 = /^[a-f0-9]{64}$/;

export type KrakenPreTradeEvidencePackage = Readonly<{
  contractVersion: typeof KRAKEN_PRE_TRADE_EVIDENCE_PACKAGE_VERSION;
  status: "VALIDATED_EVIDENCE";
  origin: "CALLER_SUPPLIED_UNVERIFIED";
  sourceApproval: "NOT_APPROVED";
  snapshotSemantics: "UNVERIFIED";
  decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS";
  instrument: Readonly<ExternalPaperInstrument>;
  source: Readonly<PaperPriceSource>;
  parser: Readonly<{ contractVersion: typeof KRAKEN_PRE_TRADE_PARSER_VERSION; payloadFingerprint: string }>;
  book: Readonly<{
    system: "CLOB"; baseNotation: "UNIT"; quoteNotation: "MONE";
    bids: readonly ParsedKrakenPreTradeLevel[]; asks: readonly ParsedKrakenPreTradeLevel[];
  }>;
  timestamps: Readonly<{ retrievedAtOriginal: string; retrievedAtCeil: string }>;
  rawResponse: string;
  fingerprint: string;
}>;

type Failure = "INPUT_INVALID" | "PARSE_INVALID" | "PACKAGE_INVALID" | "PACKAGE_TOO_LARGE" | "FINGERPRINT_MISMATCH";
export type KrakenPreTradeEvidenceResult =
  | Readonly<{ status: "VALID"; evidence: KrakenPreTradeEvidencePackage }>
  | Readonly<{ status: "INVALID"; reason: Failure }>;

const invalid = (reason: Failure) => Object.freeze({ status: "INVALID" as const, reason });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);

function validInstrument(value: unknown): value is ExternalPaperInstrument {
  if (!record(value)) return false;
  return identifier(value.instrumentId) && value.instrumentId.startsWith("paper.external.") && value.instrumentId !== "paper.external." &&
    identifier(value.baseAssetId) && !value.baseAssetId.toLowerCase().startsWith("mm.fixture.") &&
    typeof value.quoteCurrency === "string" && Object.hasOwn(CURRENCY_REGISTRY, value.quoteCurrency) &&
    identifier(value.venueId) && identifier(value.venueProductId);
}

function validSource(value: unknown): value is PaperPriceSource {
  return record(value) && value.providerId === "kraken" && identifier(value.datasetVersion) && identifier(value.adapterVersion);
}

/** Parse raw text anew; never trust a caller's projection or parser fingerprint. */
export function createKrakenPreTradeEvidencePackage(input: {
  readonly rawResponse: string;
  readonly retrievedAt: string;
  readonly instrument: ExternalPaperInstrument;
  readonly source: PaperPriceSource;
}): KrakenPreTradeEvidenceResult {
  if (!input || typeof input.rawResponse !== "string" || typeof input.retrievedAt !== "string" ||
    !validInstrument(input.instrument) || !validSource(input.source)) return invalid("INPUT_INVALID");
  const { rawResponse, retrievedAt, instrument, source } = input;
  if (rawResponse.length > KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES || Buffer.byteLength(rawResponse, "utf8") > KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES) {
    return invalid("PACKAGE_TOO_LARGE");
  }
  const parsed = parseKrakenPreTradeResponse({ rawResponse, retrievedAt, expected: {
    symbol: instrument.venueProductId, baseAsset: instrument.baseAssetId,
    quoteAsset: instrument.quoteCurrency, venueMic: instrument.venueId,
  } });
  if (parsed.status !== "VALID") return invalid("PARSE_INVALID");
  const material = {
    contractVersion: KRAKEN_PRE_TRADE_EVIDENCE_PACKAGE_VERSION,
    status: "VALIDATED_EVIDENCE" as const, origin: "CALLER_SUPPLIED_UNVERIFIED" as const,
    sourceApproval: "NOT_APPROVED" as const, snapshotSemantics: "UNVERIFIED" as const,
    decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS" as const,
    instrument: Object.freeze({ instrumentId: instrument.instrumentId, baseAssetId: instrument.baseAssetId,
      quoteCurrency: instrument.quoteCurrency, venueId: instrument.venueId, venueProductId: instrument.venueProductId }),
    source: Object.freeze({ providerId: source.providerId, datasetVersion: source.datasetVersion, adapterVersion: source.adapterVersion }),
    parser: Object.freeze({ contractVersion: KRAKEN_PRE_TRADE_PARSER_VERSION, payloadFingerprint: parsed.payloadFingerprint }),
    book: Object.freeze({ system: parsed.system, baseNotation: parsed.baseNotation, quoteNotation: parsed.quoteNotation,
      bids: parsed.bids, asks: parsed.asks }),
    timestamps: Object.freeze({ retrievedAtOriginal: parsed.retrievedAtOriginal, retrievedAtCeil: parsed.retrievedAtCeil }),
    rawResponse,
  };
  return Object.freeze({ status: "VALID", evidence: Object.freeze({ ...material, fingerprint: canonicalSha256(material) }) });
}

// Walk only the bounded reconstructed shape. Never recursively hash/serialize
// arbitrary caller graphs (cycles, deep extras or accessor properties).
function matchesReconstructed(value: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return value === expected;
  if (value === null || typeof value !== "object" || Array.isArray(value) !== Array.isArray(expected)) return false;
  const keys = Reflect.ownKeys(expected);
  if (Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor &&
      matchesReconstructed(descriptor.value, Reflect.get(expected, key));
  });
}

/** A matching hash proves content consistency, never source origin or permission. */
export function verifyKrakenPreTradeEvidencePackage(value: unknown, expectedFingerprint?: string): KrakenPreTradeEvidenceResult {
  if (!record(value) || typeof value.fingerprint !== "string" || !SHA256.test(value.fingerprint) ||
    !record(value.timestamps) || typeof value.timestamps.retrievedAtOriginal !== "string" ||
    typeof value.rawResponse !== "string" || !validInstrument(value.instrument) || !validSource(value.source)) return invalid("PACKAGE_INVALID");
  if (expectedFingerprint !== undefined && (!SHA256.test(expectedFingerprint) || expectedFingerprint !== value.fingerprint)) {
    return invalid("FINGERPRINT_MISMATCH");
  }
  const reconstructed = createKrakenPreTradeEvidencePackage({ rawResponse: value.rawResponse,
    retrievedAt: value.timestamps.retrievedAtOriginal, instrument: value.instrument, source: value.source });
  if (reconstructed.status !== "VALID") return reconstructed;
  if (reconstructed.evidence.fingerprint !== value.fingerprint) return invalid("FINGERPRINT_MISMATCH");
  if (!matchesReconstructed(value, reconstructed.evidence)) return invalid("PACKAGE_INVALID");
  return reconstructed;
}

/** Stable text-only representation. Does not write a file or persist evidence. */
export function serializeKrakenPreTradeEvidencePackage(evidence: KrakenPreTradeEvidencePackage): string {
  const verified = verifyKrakenPreTradeEvidencePackage(evidence);
  if (verified.status !== "VALID") throw new Error(`PAPER_PRE_TRADE_EVIDENCE_${verified.reason}`);
  const serialized = JSON.stringify(verified.evidence);
  if (serialized.length > KRAKEN_PRE_TRADE_MAX_SERIALIZED_PACKAGE_CHARS) throw new Error("PAPER_PRE_TRADE_EVIDENCE_PACKAGE_TOO_LARGE");
  return serialized;
}

export function readKrakenPreTradeEvidencePackage(serialized: string, expectedFingerprint?: string): KrakenPreTradeEvidenceResult {
  if (typeof serialized !== "string") return invalid("PACKAGE_INVALID");
  if (serialized.length > KRAKEN_PRE_TRADE_MAX_SERIALIZED_PACKAGE_CHARS) return invalid("PACKAGE_TOO_LARGE");
  try { return verifyKrakenPreTradeEvidencePackage(JSON.parse(serialized), expectedFingerprint); }
  catch { return invalid("PACKAGE_INVALID"); }
}
