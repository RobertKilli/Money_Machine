import { randomUUID } from "node:crypto";
import { assertValidPaperPolicy, STANDING_PAPER_POLICY_VERSION, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { FIXTURE_ASSETS } from "@/domain/strategy/fixture-assets";

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

const fields = ["financialAccountId", "allowedInstrumentIds", "capitalBudgetNok", "maxOrderNok", "maxPositionNok", "maxGrossExposureNok", "maxLossNok", "maxPriceAgeMinutes"] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function parseNokMinor(value: unknown, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)) throw new Error("PAPER_POLICY_LIMIT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if ((!allowZero && minor <= 0n) || minor > PAPER_POLICY_MAX_CAPITAL_MINOR) throw new Error("PAPER_POLICY_LIMIT_INVALID");
  return minor;
}

export function createStandingPaperDraft(raw: unknown): StandingPaperPolicy {
  if (!record(raw) || Object.keys(raw).length !== fields.length || Object.keys(raw).some(key => !(fields as readonly string[]).includes(key)) ||
    typeof raw.financialAccountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.financialAccountId) ||
    !Array.isArray(raw.allowedInstrumentIds) || raw.allowedInstrumentIds.length === 0 || raw.allowedInstrumentIds.length > FIXTURE_ASSETS.length ||
    raw.allowedInstrumentIds.some(item => typeof item !== "string" || !FIXTURE_ASSETS.some(asset => asset.assetId === item)) ||
    new Set(raw.allowedInstrumentIds).size !== raw.allowedInstrumentIds.length ||
    typeof raw.maxPriceAgeMinutes !== "number" || !Number.isSafeInteger(raw.maxPriceAgeMinutes) ||
    !PAPER_POLICY_SUPPORTED_PRICE_AGE_MINUTES.includes(raw.maxPriceAgeMinutes as typeof PAPER_POLICY_SUPPORTED_PRICE_AGE_MINUTES[number])) {
    throw new Error("PAPER_POLICY_INPUT_INVALID");
  }

  const capitalBudgetMinor = parseNokMinor(raw.capitalBudgetNok);
  if (capitalBudgetMinor < PAPER_POLICY_MIN_CAPITAL_MINOR) throw new Error("PAPER_POLICY_LIMIT_INVALID");
  const maxOrderMinor = parseNokMinor(raw.maxOrderNok);
  const maxPositionMinor = parseNokMinor(raw.maxPositionNok);
  const maxGrossExposureMinor = parseNokMinor(raw.maxGrossExposureNok);
  const maxLossMinor = parseNokMinor(raw.maxLossNok, true);
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
    financialAccountId: raw.financialAccountId,
    allowedInstrumentIds: Object.freeze([...raw.allowedInstrumentIds] as string[]),
    capitalBudgetMinor,
    maxOrderMinor,
    maxPositionMinor,
    maxGrossExposureMinor,
    maxLossMinor,
    maxPriceAgeMs: raw.maxPriceAgeMinutes * 60_000,
  });
  assertValidPaperPolicy(policy);
  return policy;
}
