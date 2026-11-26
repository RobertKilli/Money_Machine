import { createHash } from "node:crypto";
import { CURRENCY_REGISTRY } from "@/domain/financial/currency";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import {
  KRAKEN_POST_TRADE_PARSER_VERSION,
  parseKrakenPostTradeResponse,
  type KrakenPostTradeExpectedInstrument,
  type KrakenPostTradeParseResult,
} from "@/application/paper-trading/kraken-post-trade-parser";
import type { ExternalPaperInstrument, PaperPriceSource } from "@/application/paper-trading/standing-paper-market-price";

export const EXTERNAL_PAPER_PRICE_EVIDENCE_PACKAGE_VERSION = "external-paper-price-evidence-package/v1" as const;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PACKAGE_CHARS = 1_100_000;

export type KrakenPostTradeEvidencePackage = Readonly<{
  contractVersion: typeof EXTERNAL_PAPER_PRICE_EVIDENCE_PACKAGE_VERSION;
  status: "VALIDATED_EVIDENCE";
  origin: "CALLER_SUPPLIED_UNVERIFIED";
  sourceApproval: "NOT_APPROVED";
  decisionReadiness: "BLOCKED_UNCLASSIFIED_PRICE_TYPE";
  priceType: "UNCLASSIFIED_POST_TRADE";
  instrument: Readonly<ExternalPaperInstrument>;
  source: Readonly<PaperPriceSource>;
  parser: Readonly<{ contractVersion: typeof KRAKEN_POST_TRADE_PARSER_VERSION; payloadFingerprint: string }>;
  selectedTrade: Readonly<{
    tradeId: string;
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    tradeVenueMic: string;
    publicationVenueMic: string;
    price: Readonly<{ original: string; coefficient: string; scale: number }>;
    quantity: Readonly<{ original: string; coefficient: string; scale: number }>;
    timestamps: Readonly<{
      observedAtOriginal: string;
      observedAt: string;
      availableAtOriginal: string;
      availableAt: string;
      retrievedAtOriginal: string;
      retrievedAt: string;
    }>;
  }>;
  rawResponse: string;
  fingerprint: string;
}>;

export type EvidencePackageResult =
  | { readonly status: "VALID"; readonly evidence: KrakenPostTradeEvidencePackage }
  | { readonly status: "INVALID"; readonly reason: "INPUT_INVALID" | "PARSE_INVALID" | "TRADE_NOT_FOUND" | "IDENTITY_MISMATCH" | "FINGERPRINT_MISMATCH" | "PACKAGE_INVALID" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
}

function validBindings(instrument: ExternalPaperInstrument, source: PaperPriceSource): boolean {
  return safeIdentifier(instrument.instrumentId) && instrument.instrumentId.startsWith("paper.external.") &&
    safeIdentifier(instrument.baseAssetId) && !instrument.baseAssetId.toLowerCase().startsWith("mm.fixture.") &&
    safeIdentifier(instrument.quoteCurrency) && Object.hasOwn(CURRENCY_REGISTRY, instrument.quoteCurrency) &&
    instrument.quoteCurrency === instrument.quoteCurrency.toUpperCase() &&
    safeIdentifier(instrument.venueId) && safeIdentifier(instrument.venueProductId) &&
    safeIdentifier(source.providerId) && safeIdentifier(source.datasetVersion) && safeIdentifier(source.adapterVersion);
}

function materialOf(evidence: KrakenPostTradeEvidencePackage): Omit<KrakenPostTradeEvidencePackage, "fingerprint"> {
  const material = { ...evidence } as Record<string, unknown> & { fingerprint?: string };
  delete material.fingerprint;
  return material as Omit<KrakenPostTradeEvidencePackage, "fingerprint">;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parserExpected(instrument: ExternalPaperInstrument): KrakenPostTradeExpectedInstrument {
  return {
    symbol: instrument.venueProductId,
    baseAsset: instrument.baseAssetId,
    quoteAsset: instrument.quoteCurrency,
    tradeVenueMic: instrument.venueId,
    publicationVenueMic: instrument.venueId,
  };
}

function parsedInput(evidence: Pick<KrakenPostTradeEvidencePackage, "rawResponse" | "instrument" | "selectedTrade">, retrievedAt: string): KrakenPostTradeParseResult {
  return parseKrakenPostTradeResponse({ rawResponse: evidence.rawResponse, retrievedAt, expected: parserExpected(evidence.instrument) });
}

function constructEvidence(input: {
  parsed: Extract<KrakenPostTradeParseResult, { status: "VALID" }>;
  instrument: ExternalPaperInstrument;
  source: PaperPriceSource;
  tradeId: string;
}): EvidencePackageResult {
  const { parsed, instrument, source, tradeId } = input;
  const trade = parsed.trades.find((item) => item.tradeId === tradeId);
  if (!trade) return { status: "INVALID", reason: "TRADE_NOT_FOUND" };
  if (trade.symbol !== instrument.venueProductId || trade.baseAsset !== instrument.baseAssetId ||
    trade.quoteAsset !== instrument.quoteCurrency || trade.tradeVenueMic !== instrument.venueId ||
    trade.publicationVenueMic !== instrument.venueId) return { status: "INVALID", reason: "IDENTITY_MISMATCH" };
  const material = {
    contractVersion: EXTERNAL_PAPER_PRICE_EVIDENCE_PACKAGE_VERSION,
    status: "VALIDATED_EVIDENCE" as const,
    origin: "CALLER_SUPPLIED_UNVERIFIED" as const,
    sourceApproval: "NOT_APPROVED" as const,
    decisionReadiness: "BLOCKED_UNCLASSIFIED_PRICE_TYPE" as const,
    priceType: "UNCLASSIFIED_POST_TRADE" as const,
    instrument: Object.freeze({ ...instrument }),
    source: Object.freeze({ ...source }),
    parser: Object.freeze({ contractVersion: KRAKEN_POST_TRADE_PARSER_VERSION, payloadFingerprint: parsed.payloadFingerprint }),
    selectedTrade: Object.freeze({
      tradeId: trade.tradeId,
      symbol: trade.symbol,
      baseAsset: trade.baseAsset,
      quoteAsset: trade.quoteAsset,
      tradeVenueMic: trade.tradeVenueMic,
      publicationVenueMic: trade.publicationVenueMic,
      price: Object.freeze({ ...trade.price }),
      quantity: Object.freeze({ ...trade.quantity }),
      timestamps: Object.freeze({
        observedAtOriginal: trade.tradeTsOriginal,
        observedAt: trade.observedAt,
        availableAtOriginal: trade.publicationTsOriginal,
        availableAt: trade.availableAt,
        retrievedAtOriginal: parsed.retrievedAtOriginal,
        retrievedAt: parsed.retrievedAt,
      }),
    }),
    rawResponse: parsed.rawResponse,
  };
  const evidence = Object.freeze({ ...material, fingerprint: canonicalSha256(material) });
  return { status: "VALID", evidence };
}

/** Selects a caller-named trade from a valid parser result; it never chooses the final response item. */
export function createKrakenPostTradeEvidencePackage(input: {
  readonly parsed: KrakenPostTradeParseResult;
  readonly instrument: ExternalPaperInstrument;
  readonly source: PaperPriceSource;
  readonly tradeId: string;
}): EvidencePackageResult {
  if (!input || input.parsed?.status !== "VALID" || !input.instrument || !input.source ||
    !validBindings(input.instrument, input.source) || typeof input.tradeId !== "string" || input.tradeId.length === 0) {
    return { status: "INVALID", reason: input?.parsed?.status === "INVALID" ? "PARSE_INVALID" : "INPUT_INVALID" };
  }
  const reparsed = parseKrakenPostTradeResponse({
    rawResponse: input.parsed.rawResponse,
    retrievedAt: input.parsed.retrievedAtOriginal,
    expected: parserExpected(input.instrument),
  });
  if (reparsed.status !== "VALID" || reparsed.payloadFingerprint !== input.parsed.payloadFingerprint) return { status: "INVALID", reason: "PARSE_INVALID" };
  return constructEvidence({ parsed: reparsed, instrument: input.instrument, source: input.source, tradeId: input.tradeId });
}

/** Revalidates the raw parser material and the package's content fingerprint before accepting a replay. */
export function verifyKrakenPostTradeEvidencePackage(value: unknown, expectedFingerprint?: string): EvidencePackageResult {
  if (!isRecord(value) || typeof value.fingerprint !== "string" || !SHA256.test(value.fingerprint) ||
    value.contractVersion !== EXTERNAL_PAPER_PRICE_EVIDENCE_PACKAGE_VERSION || value.status !== "VALIDATED_EVIDENCE" ||
    value.origin !== "CALLER_SUPPLIED_UNVERIFIED" || value.sourceApproval !== "NOT_APPROVED" ||
    value.decisionReadiness !== "BLOCKED_UNCLASSIFIED_PRICE_TYPE" || value.priceType !== "UNCLASSIFIED_POST_TRADE" ||
    !isRecord(value.instrument) || !isRecord(value.source) || !isRecord(value.parser) || !isRecord(value.selectedTrade) ||
    !isRecord(value.selectedTrade.timestamps) || typeof value.rawResponse !== "string" || value.rawResponse.length > MAX_PACKAGE_CHARS) {
    return { status: "INVALID", reason: "PACKAGE_INVALID" };
  }
  const evidence = value as unknown as KrakenPostTradeEvidencePackage;
  if (!validBindings(evidence.instrument, evidence.source) ||
    evidence.parser.contractVersion !== KRAKEN_POST_TRADE_PARSER_VERSION || !SHA256.test(evidence.parser.payloadFingerprint)) {
    return { status: "INVALID", reason: "PACKAGE_INVALID" };
  }
  if (canonicalSha256(materialOf(evidence)) !== evidence.fingerprint || (expectedFingerprint !== undefined && expectedFingerprint !== evidence.fingerprint)) {
    return { status: "INVALID", reason: "FINGERPRINT_MISMATCH" };
  }
  const parsed = parsedInput(evidence, evidence.selectedTrade.timestamps.retrievedAtOriginal);
  if (parsed.status !== "VALID" || parsed.payloadFingerprint !== evidence.parser.payloadFingerprint || parsed.rawResponse !== evidence.rawResponse) {
    return { status: "INVALID", reason: "PARSE_INVALID" };
  }
  const reconstructed = constructEvidence({ parsed, instrument: evidence.instrument, source: evidence.source, tradeId: evidence.selectedTrade.tradeId });
  if (reconstructed.status !== "VALID" || canonicalSha256(materialOf(reconstructed.evidence)) !== evidence.fingerprint) {
    return { status: "INVALID", reason: reconstructed.status === "INVALID" ? reconstructed.reason : "PACKAGE_INVALID" };
  }
  return { status: "VALID", evidence };
}

/** Stable JSON representation; all exact numeric/time values remain decimal/text fields. */
export function serializeKrakenPostTradeEvidencePackage(evidence: KrakenPostTradeEvidencePackage): string {
  const verified = verifyKrakenPostTradeEvidencePackage(evidence);
  if (verified.status !== "VALID") throw new Error(`PAPER_PRICE_EVIDENCE_${verified.reason}`);
  return JSON.stringify(evidence);
}

export function readKrakenPostTradeEvidencePackage(serialized: string, expectedFingerprint?: string): EvidencePackageResult {
  if (typeof serialized !== "string" || serialized.length > MAX_PACKAGE_CHARS) return { status: "INVALID", reason: "PACKAGE_INVALID" };
  try {
    return verifyKrakenPostTradeEvidencePackage(JSON.parse(serialized), expectedFingerprint);
  } catch {
    return { status: "INVALID", reason: "PACKAGE_INVALID" };
  }
}

/** Useful to tie a later immutable replay row to the same content commitment. */
export function fingerprintKrakenPostTradeRawResponse(rawResponse: string): string {
  return sha256(rawResponse);
}
