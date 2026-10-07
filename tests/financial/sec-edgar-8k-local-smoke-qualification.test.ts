import { describe, expect, it } from "vitest";
import { SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE } from "@/domain/intelligence/sec-edgar-8k-local-smoke-scope";
import { createSecEdgar8kLocalSmokeQualificationFingerprint, evaluateSecEdgar8kLocalSmokeQualification, parseSecEdgar8kLocalSmokeQualification, SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS, SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_VERSION } from "@/domain/intelligence/sec-edgar-8k-local-smoke-qualification";
import { createSecEdgar8kLocalSmokeRequestPlan, createSecEdgar8kRequestPlan, isCurrentlyQualifiedSecEdgar8kRequestPlan, parseSecEdgar8kQualification } from "@/domain/intelligence/sec-edgar-8k-event-source-qualification";

const at = "2026-10-06T12:00:00.000Z";
const productionPlanInput = {
  profileId: "COMPANY_SUBMISSIONS_JSON" as const, form: "8-K", cik: "0000789019", accession: "0001193125-23-255762", documentFilename: null,
  userAgentIdentityRef: "approved-identity:synthetic", now: at, timeoutMs: 10_000, maxResponseBytes: 2 * 1024 * 1024,
  pageCount: 1, fileCount: 1, attempts: 1, redirectHost: "data.sec.gov",
  approvals: ["ACQUISITION", "AUTHORITY_ISSUANCE", "COMMERCIAL_USE", "NORMALIZED_STORAGE", "RAW_STORAGE", "REDISTRIBUTION", "RETENTION"],
};
function record(overrides: Record<string, unknown> = {}) {
  const material = {
    contractVersion: SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_VERSION,
    status: "PROPOSED",
    scope: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE,
    restrictions: SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS,
    acquisitionDecision: "REQUIRES_REVIEW",
    processMemoryDecision: "REQUIRES_REVIEW",
    userAgentIdentityRef: "approved-identity:synthetic-operator-test",
    evidence: [{ id: "SEC_PUBLIC_ACCESS_AND_REUSE", title: "SEC public dissemination policy", url: "https://www.sec.gov/about/privacy-information", checkedAt: "2026-10-06T10:00:00.000Z", claims: ["PUBLIC_ACCESS_AND_REUSE"] }],
    blockers: ["LOCAL_SMOKE_DECISION_REQUIRED"],
    reviewedAt: at,
    effectiveFrom: at,
    expiresAt: "2026-10-07T12:00:00.000Z",
    ...overrides,
  };
  if (Array.isArray(material.evidence)) material.evidence = [...material.evidence].sort((a, b) => String((a as { id?: unknown }).id).localeCompare(String((b as { id?: unknown }).id)));
  if (Array.isArray(material.blockers)) material.blockers = [...material.blockers].sort();
  const complete = { ...material, recordedAt: at, qualificationReference: "", fingerprint: "" };
  const fingerprintMaterial = { ...material } as never;
  complete.fingerprint = createSecEdgar8kLocalSmokeQualificationFingerprint(fingerprintMaterial);
  complete.qualificationReference = `sec-edgar-8k-local-smoke-qualification:${complete.fingerprint}`;
  return complete;
}
function approvedRecord(overrides: Record<string, unknown> = {}) {
  const evidence = [
    ["SEC_PUBLIC_ACCESS_AND_REUSE", "SEC privacy and dissemination policy", "https://www.sec.gov/about/privacy-information", ["PUBLIC_ACCESS_AND_REUSE"]],
    ["SEC_SUBMISSIONS_AND_HISTORY_FORMAT", "EDGAR application programming interfaces", "https://www.sec.gov/search-filings/edgar-application-programming-interfaces", ["SUBMISSIONS_MANIFEST_AND_HISTORY"]],
    ["SEC_FAIR_ACCESS_AND_USER_AGENT", "SEC developer resources", "https://www.sec.gov/about/developer-resources", ["FAIR_ACCESS_AND_IDENTIFYING_USER_AGENT"]],
    ["SELECTED_FILING_IDENTITY", "Selected SEC filing index", "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm", ["SELECTED_FILING_IDENTITY_REVIEWED"]],
  ].map(([id, title, url, claims]) => ({ id, title, url, checkedAt: "2026-10-06T10:00:00.000Z", claims }));
  return record({ status: "APPROVED_FOR_LOCAL_SMOKE", acquisitionDecision: "APPROVED", processMemoryDecision: "APPROVED", evidence, blockers: [], ...overrides });
}

describe("versioned SEC LOCAL_SMOKE qualification", () => {
  it("parses the fixed narrow proposal as syntax only and leaves the runtime gate blocked", () => {
    const parsed = parseSecEdgar8kLocalSmokeQualification(record());
    expect(parsed.status).toBe("VALID");
    if (parsed.status !== "VALID") return;
    expect(parsed.qualification.scope).toEqual(SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE);
    expect(parsed.qualification.restrictions).toEqual(SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS);
    expect(evaluateSecEdgar8kLocalSmokeQualification(parsed.qualification, at)).toEqual({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_APPROVED" });
    const assertedApprovals = parseSecEdgar8kLocalSmokeQualification(approvedRecord({ status: "PROPOSED" }));
    expect(assertedApprovals.status).toBe("VALID");
    if (assertedApprovals.status === "VALID") expect(evaluateSecEdgar8kLocalSmokeQualification(assertedApprovals.qualification, at)).toEqual({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_APPROVED" });
    const pendingDecision = parseSecEdgar8kLocalSmokeQualification(approvedRecord({ processMemoryDecision: "REQUIRES_REVIEW" }));
    expect(pendingDecision.status).toBe("VALID");
    if (pendingDecision.status === "VALID") expect(evaluateSecEdgar8kLocalSmokeQualification(pendingDecision.qualification, at)).toEqual({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_APPROVED" });
  });

  it("rejects altered scope, altered fingerprint, expired and incomplete evidence", () => {
    const original = record();
    expect(parseSecEdgar8kLocalSmokeQualification({ ...original, scope: { ...original.scope, accession: "0000000000-00-000000" } }).status).toBe("INVALID");
    expect(parseSecEdgar8kLocalSmokeQualification({ ...original, fingerprint: "f".repeat(64) }).status).toBe("INVALID");
    expect(parseSecEdgar8kLocalSmokeQualification({ ...original, userAgentIdentityRef: "sec-local-other-operator" }).status).toBe("INVALID");
    const opaqueIdentity = parseSecEdgar8kLocalSmokeQualification(record({ userAgentIdentityRef: "sec-local-operator-01" }));
    expect(opaqueIdentity.status).toBe("VALID");
    expect(parseSecEdgar8kLocalSmokeQualification(record({ userAgentIdentityRef: "bad identity" })).status).toBe("INVALID");
    const expired = parseSecEdgar8kLocalSmokeQualification(approvedRecord());
    expect(expired.status).toBe("VALID");
    if (expired.status === "VALID") expect(evaluateSecEdgar8kLocalSmokeQualification(expired.qualification, "2026-10-07T12:00:00.000Z")).toEqual({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_EXPIRED" });

    const incomplete = approvedRecord({ evidence: [] });
    const incompleteParsed = parseSecEdgar8kLocalSmokeQualification(incomplete);
    expect(incompleteParsed.status).toBe("VALID");
    if (incompleteParsed.status === "VALID") expect(evaluateSecEdgar8kLocalSmokeQualification(incompleteParsed.qualification, at)).toEqual({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_EVIDENCE_REQUIRED" });
  });

  it("does not make smoke material usable as production qualification or an authentic production plan", () => {
    const smoke = parseSecEdgar8kLocalSmokeQualification(record());
    expect(smoke.status).toBe("VALID");
    if (smoke.status === "VALID") {
      expect(parseSecEdgar8kQualification(smoke.qualification).status).toBe("INVALID");
      expect(isCurrentlyQualifiedSecEdgar8kRequestPlan(smoke.qualification, at)).toBe(false);
      expect(evaluateSecEdgar8kLocalSmokeQualification({ ...smoke.qualification }, at)).toEqual({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
      expect(createSecEdgar8kRequestPlan(smoke.qualification, productionPlanInput as never)).toBeNull();
    }
  });

  it("requires its own reviewed runtime pin before a smoke request plan can exist", () => {
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS).toEqual([]);
    const approved = parseSecEdgar8kLocalSmokeQualification(approvedRecord());
    expect(approved.status).toBe("VALID");
    if (approved.status === "VALID") {
      expect(createSecEdgar8kLocalSmokeRequestPlan(approved.qualification, {} as never)).toBeNull();
      expect(isCurrentlyQualifiedSecEdgar8kRequestPlan(approved.qualification, at)).toBe(false);
    }
  });

  it("rejects unknown fields and noncanonical references", () => {
    const value = record();
    expect(parseSecEdgar8kLocalSmokeQualification({ ...value, approval: true }).status).toBe("INVALID");
    expect(parseSecEdgar8kLocalSmokeQualification({ ...value, qualificationReference: `sec-edgar-8k-qualification:${value.fingerprint}` }).status).toBe("INVALID");
  });
});
