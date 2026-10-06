import { describe, expect, it } from "vitest";
import { SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS } from "@/infrastructure/intelligence/sec-edgar-8k-local-smoke-authorization";
import { SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS } from "@/domain/intelligence/sec-edgar-8k-local-smoke-qualification";
import { executeSecEdgar8kLocalSmoke, SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN } from "@/infrastructure/intelligence/sec-edgar-8k-node-transport";
import { runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { SEC_EDGAR_8K_SYNTHETIC_FIXTURES } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";

describe("SEC EDGAR local smoke remains operationally blocked", () => {
  it("keeps its live registry empty and dry-run network-free", () => {
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS).toEqual([]);
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS).toEqual([]);
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN.networkRequests).toBe(0);
    expect(SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN.status).toBe("BLOCKED");
  });

  it("rejects structural/copy plans as unauthentic without starting transport", async () => {
    const forged = {
      method: "GET", url: "https://data.sec.gov/submissions/CIK0000789019.json", profileId: "COMPANY_SUBMISSIONS_JSON", responseKind: "JSON", allowedContentTypes: ["application/json"], cik: "0000789019", accession: "0001193125-23-255762", form: "8-K", userAgentIdentityRef: "approved-identity:fake", timeoutMs: 1000, maxResponseBytes: 1024, pageCount: 1, fileCount: 1, attempts: 1, redirectHostPolicy: "SAME_ALLOWLISTED_HOST_ONLY", rawBodyLogging: "FORBIDDEN",
    };
    expect(await executeSecEdgar8kLocalSmoke({ plans: [forged], operatorContact: "Synthetic Test <test@example.invalid>" })).toEqual({ status: "BLOCKED", code: "SEC_SMOKE_REQUEST_PLAN_INVALID" });
  });

  it("keeps the existing deterministic parser fixture-only rather than treating SEC HTML as parsed evidence", () => {
    const synthetic = runSecEdgar8kFixtureClaimPipeline(SEC_EDGAR_8K_SYNTHETIC_FIXTURES);
    expect(synthetic.status).toBe("VALID");
    const realIdentity = JSON.parse(JSON.stringify(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0])) as Record<string, unknown>;
    const submissions = realIdentity.submissions as { cik: string };
    submissions.cik = "0000789019";
    expect(runSecEdgar8kFixtureClaimPipeline([realIdentity]).status).toBe("INVALID");
  });
});
