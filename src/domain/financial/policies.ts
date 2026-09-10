import { basisPoints } from "./basis-points";
import { money } from "./money";

export const FINANCIAL_POLICY_VERSIONS = {
  precision: "precision-registry/v1",
  rounding: "m1-rounding/v1",
  fee: "m1-fee/v1",
} as const;

export const M1_FEE_RATE = basisPoints(10n);
export const M1_MINIMUM_NOK_FEE = money("NOK", 100n);
