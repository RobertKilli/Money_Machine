import { describe, expect, it } from "vitest";
import { createStandingPaperDraft } from "@/application/paper-trading/create-standing-paper-policy";
import { standingPaperActivationConfirmationHash } from "@/domain/risk/standing-paper-policy";

const valid = {
  financialAccountId: "123e4567-e89b-42d3-a456-426614174000",
  allowedInstrumentIds: ["mm.fixture.global.v1"],
  capitalBudgetNok: "5000",
  maxOrderNok: "500",
  maxPositionNok: "1000",
  maxGrossExposureNok: "2000",
  maxLossNok: "250",
  maxPriceAgeMinutes: 60,
};

describe("standing paper policy draft input", () => {
  it("creates a versioned PAPER_ONLY DRAFT from bounded NOK limits", () => {
    const policy = createStandingPaperDraft(valid);
    expect(policy).toMatchObject({ version: "standing-paper-policy/v1", identity: `PAPER_ONLY ${policy.policyId}`, status: "DRAFT", mode: "PAPER_ONLY", financialAccountId: valid.financialAccountId });
    expect(policy.capitalBudgetMinor).toBe(500_000n);
    expect(policy.maxPriceAgeMs).toBe(3_600_000);
  });

  it("stores explicit cycle-v2 thresholds in the DRAFT and binds every version and limit to activation", () => {
    const policy = createStandingPaperDraft({ ...valid, cycleV2: { stopLossPercent: "12.5", takeProfitPercent: "30", maxHoldingHours: "72" } });
    expect(policy.cycleConfiguration).toEqual({
      contractVersion: "standing-paper-cycle/v2", fifoCostBasisVersion: "fifo-cost-basis/v2",
      exitPolicy: { version: "standing-paper-exit-policy/v1", stopLossBps: 1_250n, takeProfitBps: 3_000n, maxHoldingMs: 72 * 60 * 60 * 1_000 },
    });
    const hash = standingPaperActivationConfirmationHash(policy);
    const cycle = policy.cycleConfiguration!;
    const variants = [
      { ...cycle, exitPolicy: { ...cycle.exitPolicy, stopLossBps: 1_251n } },
      { ...cycle, exitPolicy: { ...cycle.exitPolicy, takeProfitBps: 3_001n } },
      { ...cycle, exitPolicy: { ...cycle.exitPolicy, maxHoldingMs: cycle.exitPolicy.maxHoldingMs + 1 } },
    ];
    for (const cycleConfiguration of variants) expect(standingPaperActivationConfirmationHash({ ...policy, cycleConfiguration })).not.toBe(hash);
    expect(standingPaperActivationConfirmationHash({ ...policy, cycleConfiguration: undefined })).not.toBe(hash);
    expect(() => standingPaperActivationConfirmationHash({ ...policy, cycleConfiguration: { ...cycle, contractVersion: "standing-paper-cycle/v3" as never } })).toThrow("PAPER_CYCLE_CONFIGURATION_INVALID");
  });

  it.each([
    { stopLossPercent: "0", takeProfitPercent: "30", maxHoldingHours: "72" },
    { stopLossPercent: "100", takeProfitPercent: "30", maxHoldingHours: "72" },
    { stopLossPercent: "12.5", takeProfitPercent: "0", maxHoldingHours: "72" },
    { stopLossPercent: "12.5", takeProfitPercent: "30", maxHoldingHours: "0" },
    { stopLossPercent: "12.5", takeProfitPercent: "30", maxHoldingHours: "8761" },
  ])("rejects invalid explicit cycle limits", cycleV2 => {
    expect(() => createStandingPaperDraft({ ...valid, cycleV2 })).toThrow("PAPER_POLICY_LIMIT_INVALID");
  });

  it.each([
    { ...valid, capitalBudgetNok: "0" },
    { ...valid, capitalBudgetNok: "1000001" },
    { ...valid, maxOrderNok: "1001" },
    { ...valid, maxPositionNok: "499" },
    { ...valid, maxGrossExposureNok: "999" },
    { ...valid, maxLossNok: "5001" },
    { ...valid, maxPriceAgeMinutes: 61 },
    { ...valid, allowedInstrumentIds: ["not-a-fixture"] },
    { ...valid, extra: true },
  ])("rejects unsupported or inconsistent limits", input => {
    expect(() => createStandingPaperDraft(input)).toThrow();
  });
});
