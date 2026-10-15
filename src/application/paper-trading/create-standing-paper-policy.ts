import { randomUUID } from "node:crypto";
import { assertValidPaperPolicy, STANDING_PAPER_POLICY_VERSION, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { FIXTURE_ASSETS } from "@/domain/strategy/fixture-assets";
import { PAPER_CYCLE_CONTRACT_VERSION, PAPER_CYCLE_FIFO_COST_BASIS_VERSION, STANDING_PAPER_EXIT_POLICY_VERSION, type StandingPaperCycleConfiguration } from "@/domain/risk/standing-paper-exit-policy";

export const PAPER_POLICY_MIN_CAPITAL_MINOR = 10_000n;
export const PAPER_POLICY_MAX_CAPITAL_MINOR = 100_000_000n;
export const PAPER_POLICY_SUPPORTED_PRICE_AGE_MINUTES = Object.freeze([15, 60, 1_440, 10_080] as const);

export interface StandingPaperPolicyDraftRequest {
  readonly financialAccountId: string;
  readonly allowedInstrumentIds: readonly string[];
  readonly capitalBudgetNok: string;
  readonly maxOrderNok: string;
  readonly maxPositionNok: string;
  readonly maxGrossExposureNok: string;
  readonly maxLossNok: string;
  readonly maxPriceAgeMinutes: number;
}

const baseFields = ["financialAccountId", "allowedInstrumentIds", "capitalBudgetNok", "maxOrderNok", "maxPositionNok", "maxGrossExposureNok", "maxLossNok", "maxPriceAgeMinutes"] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function parseNokMinor(value: unknown, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)) throw new Error("PAPER_POLICY_LIMIT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if ((!allowZero && minor <= 0n) || minor > PAPER_POLICY_MAX_CAPITAL_MINOR) throw new Error("PAPER_POLICY_LIMIT_INVALID");
  return minor;
}

export function createStandingPaperDraft(raw: unknown): StandingPaperPolicy {
  const input = record(raw) ? raw : null;
  const cycleEnabled = input !== null && Object.hasOwn(input, "cycleV2");
  const allowedFields = cycleEnabled ? [...baseFields, "cycleV2"] : baseFields;
  if (!input || Object.keys(input).length !== allowedFields.length || Object.keys(input).some(key => !(allowedFields as readonly string[]).includes(key)) ||
    typeof input.financialAccountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.financialAccountId) ||
    !Array.isArray(input.allowedInstrumentIds) || input.allowedInstrumentIds.length === 0 || input.allowedInstrumentIds.length > FIXTURE_ASSETS.length ||
    input.allowedInstrumentIds.some(item => typeof item !== "string" || !FIXTURE_ASSETS.some(asset => asset.assetId === item)) ||
    new Set(input.allowedInstrumentIds).size !== input.allowedInstrumentIds.length ||
    typeof input.maxPriceAgeMinutes !== "number" || !Number.isSafeInteger(input.maxPriceAgeMinutes) ||
    !PAPER_POLICY_SUPPORTED_PRICE_AGE_MINUTES.includes(input.maxPriceAgeMinutes as typeof PAPER_POLICY_SUPPORTED_PRICE_AGE_MINUTES[number])) {
    throw new Error("PAPER_POLICY_INPUT_INVALID");
  }

  let cycleConfiguration: StandingPaperCycleConfiguration | undefined;
  if (cycleEnabled) {
    const cycle = input!.cycleV2;
    if (!record(cycle) || Object.keys(cycle).length !== 3 || Object.keys(cycle).some(key => !["stopLossPercent", "takeProfitPercent", "maxHoldingHours"].includes(key)) ||
      typeof cycle.stopLossPercent !== "string" || typeof cycle.takeProfitPercent !== "string" || typeof cycle.maxHoldingHours !== "string" ||
      !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(cycle.stopLossPercent) || !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(cycle.takeProfitPercent) ||
      !/^[1-9]\d{0,3}$/.test(cycle.maxHoldingHours)) throw new Error("PAPER_POLICY_LIMIT_INVALID");
    const percentToBps = (value: string) => {
      const [whole, fraction = ""] = value.split(".");
      return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
    };
    const stopLossBps = percentToBps(cycle.stopLossPercent);
    const takeProfitBps = percentToBps(cycle.takeProfitPercent);
    const maxHoldingHours = Number(cycle.maxHoldingHours);
    if (!Number.isSafeInteger(maxHoldingHours) || maxHoldingHours > 8_760 || stopLossBps <= 0n || stopLossBps >= 10_000n || takeProfitBps <= 0n || takeProfitBps > 1_000_000n) {
      throw new Error("PAPER_POLICY_LIMIT_INVALID");
    }
    cycleConfiguration = Object.freeze({
      contractVersion: PAPER_CYCLE_CONTRACT_VERSION,
      fifoCostBasisVersion: PAPER_CYCLE_FIFO_COST_BASIS_VERSION,
      exitPolicy: Object.freeze({ version: STANDING_PAPER_EXIT_POLICY_VERSION, stopLossBps, takeProfitBps, maxHoldingMs: maxHoldingHours * 60 * 60 * 1_000 }),
    });
  }

  const capitalBudgetMinor = parseNokMinor(input!.capitalBudgetNok);
  if (capitalBudgetMinor < PAPER_POLICY_MIN_CAPITAL_MINOR) throw new Error("PAPER_POLICY_LIMIT_INVALID");
  const maxOrderMinor = parseNokMinor(input!.maxOrderNok);
  const maxPositionMinor = parseNokMinor(input!.maxPositionNok);
  const maxGrossExposureMinor = parseNokMinor(input!.maxGrossExposureNok);
  const maxLossMinor = parseNokMinor(input!.maxLossNok, true);
  if (maxOrderMinor > maxPositionMinor || maxPositionMinor > maxGrossExposureMinor || maxGrossExposureMinor > capitalBudgetMinor || maxLossMinor > capitalBudgetMinor) {
    throw new Error("PAPER_POLICY_LIMIT_INVALID");
  }

  const policyId = `paper-${randomUUID()}`;
  const policy: StandingPaperPolicy = Object.freeze({
    policyId,
    version: STANDING_PAPER_POLICY_VERSION,
    identity: `PAPER_ONLY ${policyId}`,
    mode: "PAPER_ONLY",
    status: "DRAFT",
    financialAccountId: input!.financialAccountId as string,
    allowedInstrumentIds: Object.freeze([...(input!.allowedInstrumentIds as string[])]),
    capitalBudgetMinor,
    maxOrderMinor,
    maxPositionMinor,
    maxGrossExposureMinor,
    maxLossMinor,
    maxPriceAgeMs: (input!.maxPriceAgeMinutes as number) * 60_000,
    ...(cycleConfiguration ? { cycleConfiguration } : {}),
  });
  assertValidPaperPolicy(policy);
  return policy;
}
