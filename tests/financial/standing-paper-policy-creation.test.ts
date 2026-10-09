import { describe, expect, it } from "vitest";
import { createStandingPaperDraft } from "@/application/paper-trading/create-standing-paper-policy";

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
