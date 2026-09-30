import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EVENT_INTELLIGENCE_EVENT_TYPES,
  EVENT_INTELLIGENCE_SOURCE_DECISION_VERSION,
  EVENT_INTELLIGENCE_USAGES,
  SEC_8K_ITEM_SEMANTICS,
  type EventAuthorityMaterialDesign,
  isAuthenticEventIntelligenceSourceDecision,
  parseEventIntelligenceSourceDecision,
} from "../../src/domain/intelligence/event-intelligence-source-decision";

const reviewedAt = "2026-09-30T06:38:15.000Z";
const scope = {
  "sec-edgar": ["REGULATORY_FILING", "REGULATORY_PRIMARY", "CANDIDATE_AUTHORITATIVE", "www.sec.gov"],
  "issuer-ir": ["ISSUER_CONTROLLED", "ISSUER_PRIMARY", "CANDIDATE_CORROBORATION", "www.sec.gov"],
  "exchange-regulator": ["EXCHANGE_OR_REGULATOR", "EXCHANGE_OR_REGULATOR_PRIMARY", "CANDIDATE_CORROBORATION", "www.nyse.com"],
  "globenewswire-distribution": ["ISSUER_DISTRIBUTOR", "ISSUER_DISTRIBUTION", "CANDIDATE_CORROBORATION", "www.globenewswire.com"],
  "businesswire-distribution": ["ISSUER_DISTRIBUTOR", "ISSUER_DISTRIBUTION", "CANDIDATE_CORROBORATION", "www.businesswire.com"],
  "gdelt-discovery": ["DISCOVERY_AGGREGATOR", "DISCOVERY_ONLY", "DISCOVERY_ONLY", "www.gdeltproject.org"],
  "newsapi-discovery": ["DISCOVERY_AGGREGATOR", "DISCOVERY_ONLY", "DISCOVERY_ONLY", "newsapi.org"],
} as const;

function fixture(sourceId: keyof typeof scope = "sec-edgar") {
  const [sourceKind, authorityTier, decisionStatus, host] = scope[sourceId];
  return {
    contractVersion: EVENT_INTELLIGENCE_SOURCE_DECISION_VERSION,
    sourceId, sourceKind, authorityTier, decisionStatus,
    jurisdictions: sourceId === "sec-edgar" ? ["US"] : sourceId.includes("discovery") ? ["GLOBAL"] : [],
    issuerCoverage: sourceId === "sec-edgar" ? "SEC_FILERS" : sourceId.includes("discovery") ? "AGGREGATED_GLOBAL" : "UNKNOWN",
    supportedForms: sourceId === "sec-edgar" ? ["10-K", "10-Q", "6-K", "8-K"] : [],
    supportedEventTypes: ["PURCHASE_COMPLETED", "PURCHASE_INTENT_ANNOUNCED"].sort(),
    stableIdentifiers: sourceId === "sec-edgar" ? ["accession-number", "cik", "form-type"] : ["document-url", "published-at"],
    timestampSemantics: ["filing-acceptance-time", "filing-date", "publication-time", "system-received-time"].sort(),
    correctionRetraction: "PARTIAL", paginationHistory: "DOCUMENTED_ARCHIVE", completeness: "UNKNOWN", latency: "UNKNOWN",
    requiredRequestIdentity: sourceId === "sec-edgar" ? "DECLARED_USER_AGENT" : "UNKNOWN",
    rawStoragePolicy: "NOT_APPROVED", normalizedStoragePolicy: "NOT_APPROVED",
    usageApprovals: EVENT_INTELLIGENCE_USAGES.map(usage => ({ usage, approval: "NOT_APPROVED" })),
    retentionApproval: "NOT_APPROVED", redistributionApproval: "NOT_APPROVED", commercialApproval: "NOT_APPROVED",
    pricing: { status: "UNKNOWN", note: "No plan or cost approved" },
    evidenceReferences: [{ url: `https://${host}/official-documentation`, title: "Official documentation", checkedAt: reviewedAt, classification: "DOCUMENTED", claims: ["SOURCE_SCOPE", "IDENTIFIER_FIELDS"].sort() }],
    blockers: ["EVENT_APPROVALS_REQUIRED", "EVENT_CORRECTION_POLICY_PARTIAL"].sort(),
    reviewedAt, effectiveFrom: reviewedAt, expiresAt: "2027-09-30T06:38:15.000Z", recordedAt: reviewedAt,
  };
}

describe("event intelligence source decision", () => {
  it("strictly parses immutable source decisions, binds material, and excludes recordedAt", () => {
    const first = parseEventIntelligenceSourceDecision(fixture());
    const laterRecord = parseEventIntelligenceSourceDecision({ ...fixture(), recordedAt: "2026-10-01T06:38:15.000Z" });
    expect(first.status).toBe("VALID");
    expect(laterRecord.status).toBe("VALID");
    if (first.status !== "VALID" || laterRecord.status !== "VALID") return;
    expect(first.decision.decisionStatus).toBe("CANDIDATE_AUTHORITATIVE");
    expect(first.decision.fingerprint).toBe(laterRecord.decision.fingerprint);
    const materialChange = parseEventIntelligenceSourceDecision({ ...fixture(), latency: "DOCUMENTED_DELAYED" });
    expect(materialChange.status).toBe("VALID");
    if (materialChange.status === "VALID") expect(materialChange.decision.fingerprint).not.toBe(first.decision.fingerprint);
    expect(isAuthenticEventIntelligenceSourceDecision(first.decision)).toBe(true);
    expect(isAuthenticEventIntelligenceSourceDecision({ ...first.decision })).toBe(false);
    expect(isAuthenticEventIntelligenceSourceDecision(JSON.parse(JSON.stringify(first.decision)))).toBe(false);
    expect(Object.isFrozen(first.decision)).toBe(true);
    expect(Object.isFrozen(first.decision.evidenceReferences[0].claims)).toBe(true);
    expect(Object.isFrozen(first.decision.usageApprovals[0])).toBe(true);
  });

  it("canonicalizes evidence reference order before calculating identity", () => {
    const input = fixture();
    const firstRef = input.evidenceReferences[0];
    const secondRef = { ...firstRef, url: "https://www.sec.gov/official-fair-access", title: "Official fair access documentation", claims: ["FAIR_ACCESS"] };
    const a = parseEventIntelligenceSourceDecision({ ...input, evidenceReferences: [firstRef, secondRef] });
    const b = parseEventIntelligenceSourceDecision({ ...input, evidenceReferences: [secondRef, firstRef] });
    expect(a.status).toBe("VALID");
    expect(b.status).toBe("VALID");
    if (a.status === "VALID" && b.status === "VALID") {
      expect(a.decision.fingerprint).toBe(b.decision.fingerprint);
      expect(a.decision.evidenceReferences.map(ref => ref.url)).toEqual([...a.decision.evidenceReferences.map(ref => ref.url)].sort());
    }
  });

  it("rejects unsafe object and array shapes, duplicate references, and unsafe identifiers", () => {
    const input = fixture();
    expect(parseEventIntelligenceSourceDecision({ ...input, unknown: true }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision(Object.assign(Object.create({ inherited: true }), input)).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, [Symbol("hidden")]: true }).status).toBe("INVALID");
    const getter = { ...input };
    Object.defineProperty(getter, "recordedAt", { get: () => reviewedAt, enumerable: true });
    expect(parseEventIntelligenceSourceDecision(getter).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision(Object.assign(Object.create(null), input)).status).toBe("INVALID");
    const unsafeArray = Object.setPrototypeOf([...input.supportedForms], { polluted: true });
    expect(parseEventIntelligenceSourceDecision({ ...input, supportedForms: unsafeArray }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, stableIdentifiers: ["https://example.invalid/id"] }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, stableIdentifiers: ["issuer.example.finance"] }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, stableIdentifiers: ["api-token"] }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, evidenceReferences: [input.evidenceReferences[0], input.evidenceReferences[0]] }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, supportedForms: ["8-K", "10-K"] }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...input, effectiveFrom: "2026-02-30T06:38:15.000Z" }).status).toBe("INVALID");
  });

  it("keeps discovery source role and authority tier inseparable and requires all approvals", () => {
    expect(parseEventIntelligenceSourceDecision(fixture("gdelt-discovery")).status).toBe("VALID");
    expect(parseEventIntelligenceSourceDecision({ ...fixture("gdelt-discovery"), decisionStatus: "CANDIDATE_AUTHORITATIVE" }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...fixture("sec-edgar"), sourceKind: "DISCOVERY_AGGREGATOR", authorityTier: "DISCOVERY_ONLY", decisionStatus: "CANDIDATE_AUTHORITATIVE" }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...fixture(), usageApprovals: fixture().usageApprovals.slice(1) }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...fixture(), usageApprovals: fixture().usageApprovals.map((item, i) => i ? item : fixture().usageApprovals[1]) }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...fixture(), decisionStatus: "READY" }).status).toBe("INVALID");
    expect(parseEventIntelligenceSourceDecision({ ...fixture(), blockers: [] }).status).toBe("INVALID");
  });

  it("keeps filing/event lifecycle labels distinct and production fail-closed", () => {
    expect(SEC_8K_ITEM_SEMANTICS["1.01"].completionProven).toBe(false);
    expect(SEC_8K_ITEM_SEMANTICS["2.01"].completionProven).toBe(true);
    expect(EVENT_INTELLIGENCE_EVENT_TYPES).toContain("PURCHASE_INTENT_ANNOUNCED");
    expect(EVENT_INTELLIGENCE_EVENT_TYPES).toContain("PURCHASE_COMPLETED");
    expect(EVENT_INTELLIGENCE_EVENT_TYPES).toContain("DEFINITIVE_PURCHASE_AGREEMENT");
    expect(EVENT_INTELLIGENCE_EVENT_TYPES.indexOf("PURCHASE_INTENT_ANNOUNCED")).not.toBe(EVENT_INTELLIGENCE_EVENT_TYPES.indexOf("PURCHASE_COMPLETED"));
    expect(EVENT_INTELLIGENCE_EVENT_TYPES.indexOf("DEFINITIVE_PURCHASE_AGREEMENT")).not.toBe(EVENT_INTELLIGENCE_EVENT_TYPES.indexOf("PURCHASE_COMPLETED"));
    expect(EVENT_INTELLIGENCE_EVENT_TYPES).toContain("CORRECTION_OR_RETRACTION");
    expect(EVENT_INTELLIGENCE_EVENT_TYPES).toContain("TRANSACTION_TERMINATED");
    expect(EVENT_INTELLIGENCE_EVENT_TYPES).not.toContain("PURCHASE_INTENT_OR_COMPLETED" as never);
    const config = JSON.parse(readFileSync(new URL("../../config/intelligence/event-intelligence-source-decision.production.json", import.meta.url), "utf8"));
    expect(config.selectedProductionSourceStack).toEqual([]);
    expect(config.productionAcquisition).toBe("BLOCKED");
    expect(config.eventAuthorityPersistence).toBe("BLOCKED");
    expect(config.tradingSignalGeneration).toBe("BLOCKED");
    expect(config.mappingAuthority).toBeNull();
    expect(config.candidates.every((source: { productionEnabled: boolean }) => !source.productionEnabled)).toBe(true);
    expect(config.usageApprovals.every((approval: { approval: string }) => approval.approval === "NOT_APPROVED")).toBe(true);
    expect(config.candidates.map((source: { sourceId: string }) => source.sourceId)).toHaveLength(new Set(config.candidates.map((source: { sourceId: string }) => source.sourceId)).size);
  });

  it("does not collapse publication, event, expected completion, and system receipt times", () => {
    const example = {
      announcementAt: "2026-01-01T12:00:00.000Z",
      filingOrPublicationAt: "2026-01-01T12:04:00.000Z",
      effectiveOrCompletionAt: "2026-02-01T00:00:00.000Z",
      receivedAt: "2026-01-01T12:04:02.000Z",
      expectedClosingAt: "2026-02-15T00:00:00.000Z",
    };
    expect(new Set(Object.values(example)).size).toBe(5);
    expect(example.effectiveOrCompletionAt).not.toBe(example.expectedClosingAt);
  });

  it("keeps event amount and issuer/asset mapping scopes explicit without issuing authority", () => {
    const material: Pick<EventAuthorityMaterialDesign, "issuerCik" | "issuerMappingRevisionFingerprint" | "assetIdentityId" | "assetMappingRevisionFingerprint" | "amount" | "amountCurrency" | "amountStatus" | "sourceArtifactFingerprint" | "sourceDecisionFingerprint"> = {
      issuerCik: "0000000001", issuerMappingRevisionFingerprint: "issuer-map-rev-1", assetIdentityId: "asset-identity-1", assetMappingRevisionFingerprint: "asset-map-rev-1",
      amount: "1250000.00", amountCurrency: "USD", amountStatus: "EXACT", sourceArtifactFingerprint: "artifact-sha256", sourceDecisionFingerprint: "decision-sha256",
    };
    expect(material.amount).toBe("1250000.00");
    expect(material.issuerCik).not.toBe(material.assetIdentityId);
    expect(material.issuerMappingRevisionFingerprint).not.toBe(material.assetMappingRevisionFingerprint);
    expect(isAuthenticEventIntelligenceSourceDecision(material)).toBe(false);
  });
});
