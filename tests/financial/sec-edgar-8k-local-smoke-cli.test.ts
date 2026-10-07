import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  records: [] as { reference: string; material: unknown }[],
  permits: [] as Record<string, unknown>[],
  request: vi.fn(),
  parseQualification: vi.fn(),
  createPlan: vi.fn(),
  evaluateQualification: vi.fn(),
  run: vi.fn(),
}));

vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("@/domain/intelligence/sec-edgar-8k-event-source-qualification", () => ({
  createSecEdgar8kLocalSmokeRequestPlan: mocks.createPlan,
}));
vi.mock("@/domain/intelligence/sec-edgar-8k-local-smoke-qualification", () => ({
  SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS: mocks.records,
  parseSecEdgar8kLocalSmokeQualification: mocks.parseQualification,
  evaluateSecEdgar8kLocalSmokeQualification: mocks.evaluateQualification,
}));
vi.mock("@/infrastructure/intelligence/sec-edgar-8k-local-smoke-authorization", () => ({ SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS: mocks.permits }));
vi.mock("@/infrastructure/intelligence/sec-edgar-8k-local-smoke-runner", () => ({ runSecEdgar8kLocalSmoke: mocks.run }));

import { runSecEdgar8kSmokeCli } from "@/infrastructure/intelligence/sec-edgar-8k-local-smoke-cli";
import { createSecEdgar8kLocalSmokeDryRun } from "@/infrastructure/intelligence/sec-edgar-8k-local-smoke-dry-run";

const reference = `sec-edgar-8k-local-smoke-qualification:${"a".repeat(64)}`;
const contact = "Synthetic Test Operator <sec-test@example.invalid>";
const qualification = { status: "APPROVED_FOR_LOCAL_SMOKE", qualificationReference: reference, userAgentIdentityRef: "sec-local-operator-01" };
const permit = {
  authorizationId: "synthetic-permit-001",
  qualificationReference: reference,
  cik: "0000789019",
  accession: "0001193125-23-255762",
  form: "8-K",
  profileIds: ["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"],
  userAgentIdentityRef: "sec-local-operator-01",
  expiresAt: "",
  maxRequests: 3,
  minimumIntervalMs: 1000,
};

describe("SEC local-smoke CLI", () => {
  beforeEach(() => {
    mocks.records.splice(0);
    mocks.permits.splice(0);
    mocks.request.mockReset();
    mocks.parseQualification.mockReset();
    mocks.createPlan.mockReset();
    mocks.run.mockReset();
    mocks.parseQualification.mockReturnValue({ status: "VALID", qualification });
    mocks.evaluateQualification.mockReturnValue({ status: "APPROVED_FOR_LOCAL_SMOKE", qualification });
    mocks.createPlan.mockReturnValue({ authenticSyntheticPlan: true });
    mocks.run.mockResolvedValue({ status: "VERIFIED", evidence: { status: "synthetic-only" } });
  });

  it("validates the closed argument grammar without echoing input", async () => {
    for (const args of [[], ["--execute"], ["--dry-run", "--execute"], ["--execute", "--qualification-ref", "bad", "--permit-id", "x"], ["--dry-run", "--contact", contact]]) {
      const result = await runSecEdgar8kSmokeCli(args, contact);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("SEC_SMOKE_CLI_ARGUMENTS_INVALID");
      expect(result.output).not.toContain(contact);
    }
  });

  it("preserves a network-free dry-run", async () => {
    const result = await runSecEdgar8kSmokeCli(["--dry-run"], undefined);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({ status: "BLOCKED", networkRequests: 0 });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("blocks execute before the runner when code-pinned qualifications and permits are empty", async () => {
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result).toEqual({ exitCode: 1, output: JSON.stringify({ status: "BLOCKED", code: "SEC_SMOKE_QUALIFICATION_REFERENCE_UNAVAILABLE" }) });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("requires a local contact after exact qualification and permit references resolve", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.permits.push({ ...permit, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], undefined);
    expect(result.output).toContain("SEC_SMOKE_OPERATOR_CONTACT_REQUIRED");
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects header controls and noncanonical contact values before plan creation", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.permits.push({ ...permit, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    for (const invalidContact of ["Synthetic Test Operator <sec-test@example.invalid>\r\nX-Injected: yes", "Synthetic\u0000Operator <sec-test@example.invalid>", " Synthetic Test Operator <sec-test@example.invalid>"]) {
      const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], invalidContact);
      expect(result.output).toContain("SEC_SMOKE_OPERATOR_CONTACT_REQUIRED");
      expect(result.output).not.toContain(invalidContact);
    }
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects ambiguous duplicate code-pinned references rather than selecting the first", async () => {
    mocks.records.push({ reference, material: { synthetic: true } }, { reference, material: { synthetic: true } });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result.output).toContain("SEC_SMOKE_QUALIFICATION_REFERENCE_UNAVAILABLE");
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("blocks an absent permit independently of caller contact", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result.output).toContain("SEC_SMOKE_AUTHORIZATION_REQUIRED");
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects a permit pinned to a different smoke qualification reference", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.permits.push({ ...permit, qualificationReference: `sec-edgar-8k-local-smoke-qualification:${"b".repeat(64)}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result.output).toContain("SEC_SMOKE_AUTHORIZATION_REQUIRED");
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("reports code readiness separately from the current window and hides contact data", () => {
    const beforeWindow = "2026-10-07T07:59:59.000Z";
    const windowedQualification = {
      ...qualification,
      effectiveFrom: "2026-10-07T08:00:00.000Z",
      expiresAt: "2026-10-08T08:00:00.000Z",
    };
    mocks.parseQualification.mockReturnValue({ status: "VALID", qualification: windowedQualification });
    mocks.evaluateQualification.mockReturnValue({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_YET_EFFECTIVE" });
    mocks.records.push({ reference, material: { synthetic: true } });

    const result = createSecEdgar8kLocalSmokeDryRun(contact, beforeWindow);
    expect(result).toMatchObject({
      status: "BLOCKED",
      codeReadiness: "READY",
      qualificationStatus: "PINNED_APPROVED",
      qualificationWindow: { status: "NOT_YET_OPEN" },
      operatorContactStatus: "FORMAT_VALID",
      permissionToExecuteNow: "BLOCKED",
      networkRequests: 0,
    });
    expect(JSON.stringify(result)).not.toContain(contact);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects a permit whose opaque contact identity binding differs from the qualification", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.permits.push({ ...permit, userAgentIdentityRef: "sec-local-other-operator", expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result.output).toContain("SEC_SMOKE_AUTHORIZATION_REQUIRED");
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("blocks invalid qualification and expired or ambiguous permits", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.parseQualification.mockReturnValue({ status: "INVALID", blocker: "SEC_EDGAR_8K_QUALIFICATION_INVALID" });
    expect((await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact)).output).toContain("SEC_SMOKE_QUALIFICATION_REFERENCE_UNAVAILABLE");
    expect(mocks.run).not.toHaveBeenCalled();

    mocks.parseQualification.mockReturnValue({ status: "VALID", qualification });
    mocks.permits.push({ ...permit, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact)).output).toContain("SEC_SMOKE_AUTHORIZATION_REQUIRED");
    mocks.permits.push({ ...permit, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    expect((await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact)).output).toContain("SEC_SMOKE_AUTHORIZATION_REQUIRED");
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("passes only resolved code-pinned scope through the existing runner in a synthetic positive flow", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.permits.push({ ...permit, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ status: "VERIFIED", evidence: { status: "synthetic-only" } });
    expect(mocks.createPlan).toHaveBeenCalledWith(qualification, expect.objectContaining({
      profileId: "COMPANY_SUBMISSIONS_JSON",
      cik: "0000789019",
      accession: "0001193125-23-255762",
      form: "8-K",
      userAgentIdentityRef: "sec-local-operator-01",
      timeoutMs: 10_000,
      maxResponseBytes: 2 * 1024 * 1024,
      pageCount: 1,
      fileCount: 1,
      attempts: 1,
      redirectHost: "data.sec.gov",
      approvals: [],
    }));
    expect(mocks.run).toHaveBeenCalledWith({ initialPlan: { authenticSyntheticPlan: true }, operatorContact: contact, authorizationId: "synthetic-permit-001" });
    expect(result.output).not.toContain(contact);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("propagates a runner block as a failed CLI invocation without disclosing contact", async () => {
    mocks.records.push({ reference, material: { synthetic: true } });
    mocks.permits.push({ ...permit, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    mocks.run.mockResolvedValue({ status: "BLOCKED", code: "SEC_SMOKE_ABORTED" });
    const result = await runSecEdgar8kSmokeCli(["--execute", "--qualification-ref", reference, "--permit-id", "synthetic-permit-001"], contact);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("SEC_SMOKE_ABORTED");
    expect(result.output).not.toContain(contact);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
