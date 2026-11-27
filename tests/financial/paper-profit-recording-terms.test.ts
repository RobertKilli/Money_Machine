import { describe, expect, it } from "vitest";
import { assertValidPaperPolicy, paperProfitAllocationConfirmationHash, standingPaperActivationConfirmationHash,
  type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";

const base: StandingPaperPolicy = {
  policyId: "paper-profit-terms-test", version: "standing-paper-policy/v1", identity: "synthetic-profit-terms",
  mode: "PAPER_ONLY", status: "DRAFT", financialAccountId: "account-1", allowedInstrumentIds: ["mm.fixture.global.v1"],
  capitalBudgetMinor: 20_000n, maxOrderMinor: 10_000n, maxPositionMinor: 20_000n, maxGrossExposureMinor: 20_000n,
  maxLossMinor: 2_000n, maxPriceAgeMs: 3_600_000,
  cycleConfiguration: { contractVersion: "standing-paper-cycle/v2", fifoCostBasisVersion: "fifo-cost-basis/v2",
    exitPolicy: { version: "standing-paper-exit-policy/v1", stopLossBps: 2_000n, takeProfitBps: 1_000n, maxHoldingMs: 3_600_000 } },
};
const configured = (): StandingPaperPolicy => ({ ...base, profitAllocationConfiguration: {
  version: "paper-profit-allocation/v1", recordingMode: "RECORD_ONLY", enabled: true, reinvestmentBps: 5_000n,
} });

describe("approved PAPER profit recording terms", () => {
  it("keeps legacy unconfigured confirmation hashes unchanged", () => {
    expect(standingPaperActivationConfirmationHash({ ...base })).toBe(standingPaperActivationConfirmationHash({ ...base, profitAllocationConfiguration: undefined }));
    expect(() => assertValidPaperPolicy(base)).not.toThrow();
  });

  it("binds every allocation term into both consent hashes and binds the separate owner identity", () => {
    const policy = configured();
    expect(() => assertValidPaperPolicy(policy)).not.toThrow();
    const changed = { ...policy, profitAllocationConfiguration: { ...policy.profitAllocationConfiguration!, reinvestmentBps: 7_000n } };
    const disabled = { ...policy, profitAllocationConfiguration: { ...policy.profitAllocationConfiguration!, enabled: false } };
    for (const other of [changed, disabled]) {
      expect(standingPaperActivationConfirmationHash(other)).not.toBe(standingPaperActivationConfirmationHash(policy));
      expect(paperProfitAllocationConfirmationHash(other, "owner-1")).not.toBe(paperProfitAllocationConfirmationHash(policy, "owner-1"));
    }
    expect(paperProfitAllocationConfirmationHash(policy, "owner-2")).not.toBe(paperProfitAllocationConfirmationHash(policy, "owner-1"));
    const reordered = { ...policy, profitAllocationConfiguration: { reinvestmentBps: 5_000n, enabled: true,
      recordingMode: "RECORD_ONLY" as const, version: "paper-profit-allocation/v1" as const } };
    expect(standingPaperActivationConfirmationHash(reordered)).toBe(standingPaperActivationConfirmationHash(policy));
  });

  it.each([
    { recordingMode: "ENFORCE" }, { enabled: "true" }, { reinvestmentBps: 5_000 }, { reinvestmentBps: -1n },
    { reinvestmentBps: 10_001n }, { version: "unknown" }, { extra: true },
  ])("rejects unknown or malformed terms before activation (case %#)", override => {
    const policy = configured();
    const invalid = { ...policy, profitAllocationConfiguration: { ...policy.profitAllocationConfiguration!, ...override } } as StandingPaperPolicy;
    expect(() => assertValidPaperPolicy(invalid)).toThrow("PAPER_PROFIT_CONFIGURATION_INVALID");
  });

  it("requires cycle v2 for recording and refuses to treat the absence of terms as consent", () => {
    expect(() => assertValidPaperPolicy({ ...configured(), cycleConfiguration: undefined })).toThrow("PAPER_PROFIT_CONFIGURATION_INVALID");
    expect(() => paperProfitAllocationConfirmationHash(base, "owner-1")).toThrow("PAPER_PROFIT_CONFIGURATION_MISSING");
  });
});
