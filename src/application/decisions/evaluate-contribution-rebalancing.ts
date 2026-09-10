import { createHash, randomUUID } from "node:crypto";

import { money, type Money } from "@/domain/financial/money";
import type { CurrencyCode } from "@/domain/financial/currency";
import { assessProposal, type RiskDecision } from "@/domain/risk/m1-risk";
import { contributionRebalancing, type FixtureAsset, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";
import type { DecisionPortfolioState } from "@/domain/strategy/fixture-assets";

export interface PersistedDecisionResult { readonly decisionId: string; readonly financialAccountId: string; readonly status: "APPROVED" | "REJECTED"; readonly proposedOrderIds: readonly string[]; }

export interface EvaluateContributionRebalancingInput {
  readonly actorId: string;
  readonly financialAccountId: string;
  readonly decisionTimestamp?: Date;
  readonly idempotencyKey: string;
}

export interface DecisionReadRepository {
  getFinancialAccountOverview(financialAccountId: string, ownerId: string): Promise<{ account: { id: string; baseCurrencyCode: CurrencyCode; mode: "SIMULATION" | "PAPER"; status: "ACTIVE" | "CLOSED" }; availableCash: Money } | undefined>;
  getDecisionPortfolioState?(financialAccountId: string, ownerId: string, asOf: Date): Promise<DecisionPortfolioState | undefined>;
}

export interface DecisionPersistenceRepository {
  getFixtureInputs(): Promise<{ assets: readonly FixtureAsset[]; prices: readonly FixturePriceObservation[] }>;
  persist(decision: ReturnType<typeof contributionRebalancing>, risk: RiskDecision, actorId: string, idempotencyKey: string, requestHash: string, occurredAt?: Date): Promise<PersistedDecisionResult>;
}

export class EvaluateContributionRebalancing {
  constructor(private readonly accounts: DecisionReadRepository, private readonly decisions: DecisionPersistenceRepository) {}

  async execute(input: EvaluateContributionRebalancingInput): Promise<PersistedDecisionResult> {
    const overview = await this.accounts.getFinancialAccountOverview(input.financialAccountId, input.actorId);
    if (!overview) throw new Error("Financial account was not found");
    if (overview.account.status !== "ACTIVE" || overview.account.mode !== "SIMULATION") throw new Error("Financial account is not an active simulation account");
    if (overview.account.baseCurrencyCode !== "NOK") throw new Error("M1C fixture strategy supports NOK accounts only");
    const decisionTimestamp = input.decisionTimestamp ?? new Date(Date.now() + 1_000);
    const fixtures = await this.decisions.getFixtureInputs();
    const portfolioState = this.accounts.getDecisionPortfolioState ? await this.accounts.getDecisionPortfolioState(overview.account.id, input.actorId, decisionTimestamp) : undefined;
    if (this.accounts.getDecisionPortfolioState && !portfolioState) throw new Error("DECISION_PORTFOLIO_UNAVAILABLE");
    const decision = contributionRebalancing({ financialAccountId: overview.account.id, decisionId: randomUUID(), cash: overview.availableCash, decisionTimestamp, assets: fixtures.assets, prices: fixtures.prices, portfolioState });
    const decisionNav = portfolioState ? money("NOK", portfolioState.decisionNavMinor) : overview.availableCash;
    const riskDecisions = decision.proposedOrders.map((order) => assessProposal(order, { accountActive: true, simulationMode: true, strategyEnabled: true, strategyVersion: decision.strategyVersion, accountCurrency: "NOK", availableCash: overview.availableCash, decisionNav, decisionTimestamp, assets: fixtures.assets, prices: fixtures.prices, portfolioState }));
    const risk = aggregateRisk(riskDecisions);
    const requestHash = createHash("sha256").update(JSON.stringify({ account: input.financialAccountId, decisionTimestamp: decisionTimestamp.toISOString(), strategy: decision.strategyVersion, cash: overview.availableCash.minorUnits.toString(), priceIds: decision.proposedOrders.map((order) => order.referencePriceRecordId) })).digest("hex");
    return this.decisions.persist(decision, risk, input.actorId, input.idempotencyKey, requestHash, new Date());
  }
}

function aggregateRisk(results: readonly RiskDecision[]): RiskDecision {
  const violations = results.flatMap((result) => result.violations);
  return Object.freeze({ policyVersion: "m1-risk-policy/v1", disposition: violations.length ? "REJECT" : "APPROVE", violations: Object.freeze(violations), explanation: violations.length ? violations.map((item) => item.message).join("; ") : "All proposed orders satisfy deterministic risk rules" });
}
