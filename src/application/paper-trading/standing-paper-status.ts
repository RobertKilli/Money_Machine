export type StandingPaperStatus = "NO_POLICY" | "NO_ROUNDS" | "AVAILABLE" | "INCOMPLETE" | "INVALID";

export interface StandingPaperStatusDecision {
  readonly orderId: string;
  readonly decisionId: string;
  readonly outcome: "SIMULATED_FILLED" | "REJECTED";
  readonly reasonCode: string;
  readonly disposition: "APPROVE" | "REJECT";
  readonly recordedAt: string;
}

export interface StandingPaperStatusFill {
  readonly fillId: string;
  readonly orderId: string;
  readonly instrumentId: string;
  readonly quantityAtoms: string;
  readonly quantityScale: number;
  readonly grossMinor: string;
  readonly feeMinor: string;
  readonly currency: "NOK";
  readonly simulatedAt: string;
  readonly executionPolicyVersion: string;
}

export interface StandingPaperPolicyStatusCard {
  readonly status: Exclude<StandingPaperStatus, "NO_POLICY">;
  readonly policyId: string;
  readonly identity: string | null;
  readonly version: string | null;
  readonly policyStatus: "DRAFT" | "ACTIVE" | "PAUSED" | "STOPPED" | "UNKNOWN";
  readonly mode: "PAPER_ONLY" | "UNKNOWN";
  readonly workerStatus: "UNKNOWN";
  readonly allowedInstrumentIds: readonly string[];
  readonly riskLimits: {
    readonly capitalBudgetMinor: string | null;
    readonly maxOrderMinor: string | null;
    readonly maxPositionMinor: string | null;
    readonly maxGrossExposureMinor: string | null;
    readonly maxLossMinor: string | null;
    readonly maxPriceAgeMs: number | null;
  };
  readonly lastRound: null | { readonly id: string; readonly completedAt: string; readonly asOf: string };
  readonly netContributionsMinor: string | null;
  readonly committedCapitalMinor: string | null;
  readonly remainingCapitalBudgetMinor: string | null;
  readonly portfolioValueMinor: string | null;
  readonly portfolioValueAsOf: string | null;
  readonly currentLossMinor: string | null;
  readonly remainingLossMarginMinor: string | null;
  readonly decisions: readonly StandingPaperStatusDecision[];
  readonly fills: readonly StandingPaperStatusFill[];
  readonly issueCode: "PAPER_MATERIAL_INVALID" | "PAPER_VALUATION_INCOMPLETE" | null;
}

export interface StandingPaperStatusReadModel {
  readonly status: StandingPaperStatus;
  readonly classification: "PAPER_ONLY_SYNTHETIC_SIMULATION";
  readonly workerStatus: "UNKNOWN";
  readonly policies: readonly StandingPaperPolicyStatusCard[];
}
