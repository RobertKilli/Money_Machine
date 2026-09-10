import { createHash } from "node:crypto";
import type { Price } from "@/domain/financial/price";
import { quantity, type AssetQuantity, assertQuantityIncrement } from "@/domain/financial/quantity";
import { buySettlementNotional } from "@/domain/financial/rounding";
import { money, type Money } from "@/domain/financial/money";

export const FIXTURE_ASSET_REGISTRY_VERSION = "fixture-asset-registry/v1";
export const FIXTURE_DATASET_VERSION = "mm-fixture-market-data/v1";
export const CONTRIBUTION_REBALANCING_VERSION = "contribution-rebalancing/v1";
export const M1_RISK_POLICY_VERSION = "m1-risk-policy/v1";
export const CASH_RESERVE_BPS = 1_000n;

export interface FixtureAsset {
  readonly assetId: string;
  readonly symbol: "MM_GLOBAL" | "MM_GROWTH" | "MM_DEFENSIVE";
  readonly displayName: string;
  readonly quoteCurrencyCode: "NOK";
  readonly quantityScale: 4;
  readonly minimumQuantityIncrementAtoms: bigint;
  readonly classification: "SYNTHETIC_FIXTURE";
  readonly registryVersion: typeof FIXTURE_ASSET_REGISTRY_VERSION;
  readonly active: boolean;
  readonly targetWeightBps: bigint;
}

export const FIXTURE_ASSETS: readonly FixtureAsset[] = Object.freeze([
  Object.freeze({ assetId: "mm.fixture.global.v1", symbol: "MM_GLOBAL", displayName: "Money Machine Global Fixture", quoteCurrencyCode: "NOK", quantityScale: 4, minimumQuantityIncrementAtoms: 1n, classification: "SYNTHETIC_FIXTURE", registryVersion: FIXTURE_ASSET_REGISTRY_VERSION, active: true, targetWeightBps: 6_000n }),
  Object.freeze({ assetId: "mm.fixture.growth.v1", symbol: "MM_GROWTH", displayName: "Money Machine Growth Fixture", quoteCurrencyCode: "NOK", quantityScale: 4, minimumQuantityIncrementAtoms: 1n, classification: "SYNTHETIC_FIXTURE", registryVersion: FIXTURE_ASSET_REGISTRY_VERSION, active: true, targetWeightBps: 2_500n }),
  Object.freeze({ assetId: "mm.fixture.defensive.v1", symbol: "MM_DEFENSIVE", displayName: "Money Machine Defensive Fixture", quoteCurrencyCode: "NOK", quantityScale: 4, minimumQuantityIncrementAtoms: 1n, classification: "SYNTHETIC_FIXTURE", registryVersion: FIXTURE_ASSET_REGISTRY_VERSION, active: true, targetWeightBps: 1_500n }),
]);

export interface FixturePriceObservation {
  readonly recordId: string;
  readonly assetId: string;
  readonly price: Price;
  readonly observedAt: Date;
  readonly availableAt: Date;
  readonly ingestedAt: Date;
  readonly datasetVersion: typeof FIXTURE_DATASET_VERSION;
}

export function latestAvailablePrice(prices: readonly FixturePriceObservation[], assetId: string, decisionTimestamp: Date): FixturePriceObservation | undefined {
  return prices
    .filter((candidate) => candidate.assetId === assetId && candidate.availableAt.getTime() <= decisionTimestamp.getTime())
    .sort((left, right) => right.availableAt.getTime() - left.availableAt.getTime() || right.observedAt.getTime() - left.observedAt.getTime() || right.recordId.localeCompare(left.recordId))[0];
}

export interface ProposedOrder {
  readonly proposalId: string;
  readonly financialAccountId: string;
  readonly assetId: string;
  readonly side: "BUY";
  readonly orderType: "MARKET";
  readonly quantity: AssetQuantity;
  readonly referencePrice: Price;
  readonly referencePriceRecordId: string;
  readonly referenceNotional: Money;
  readonly decisionTimestamp: Date;
  readonly strategyVersion: typeof CONTRIBUTION_REBALANCING_VERSION;
  readonly registryVersion: typeof FIXTURE_ASSET_REGISTRY_VERSION;
  readonly datasetVersion: typeof FIXTURE_DATASET_VERSION;
}

export interface DecisionPortfolioHolding {
  readonly assetId: string;
  readonly marketValueMinor: bigint;
}

export interface DecisionPortfolioState {
  readonly cashMinor: bigint;
  readonly decisionNavMinor: bigint;
  readonly holdings: readonly DecisionPortfolioHolding[];
  readonly existingMarketValueByAsset: Readonly<Record<string, bigint>>;
  readonly priceRecordIds: readonly string[];
}

function deterministicId(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16]!, 16) & 3) | 8).toString(16);
  return `${bytes.slice(0, 8).join("")}-${bytes.slice(8, 12).join("")}-${bytes.slice(12, 16).join("")}-${bytes.slice(16, 20).join("")}-${bytes.slice(20).join("")}`;
}

export interface ContributionRebalancingInput {
  readonly financialAccountId: string;
  readonly decisionId: string;
  readonly cash: Money;
  readonly decisionTimestamp: Date;
  readonly assets?: readonly FixtureAsset[];
  readonly prices: readonly FixturePriceObservation[];
  readonly portfolioState?: DecisionPortfolioState;
}

export interface StrategyDecision {
  readonly decisionId: string;
  readonly financialAccountId: string;
  readonly strategyVersion: typeof CONTRIBUTION_REBALANCING_VERSION;
  readonly decisionTimestamp: Date;
  readonly inputCash: Money;
  readonly decisionNav: Money;
  readonly reserve: Money;
  readonly investableCash: Money;
  readonly proposedOrders: readonly ProposedOrder[];
  readonly residualCash: Money;
  readonly targetAllocationBps: Readonly<Record<string, string>>;
}

export function contributionRebalancing(input: ContributionRebalancingInput): StrategyDecision {
  if (input.cash.minorUnits < 0n) throw new Error("Strategy cash cannot be negative");
  const assets = input.assets ?? FIXTURE_ASSETS;
  const state = input.portfolioState ?? { cashMinor: input.cash.minorUnits, decisionNavMinor: input.cash.minorUnits, holdings: [], existingMarketValueByAsset: {}, priceRecordIds: [] };
  if (state.cashMinor !== input.cash.minorUnits || state.decisionNavMinor < 0n) throw new Error("DECISION_PORTFOLIO_STATE_MISMATCH");
  const reserve = money(input.cash.currencyCode, (state.decisionNavMinor * CASH_RESERVE_BPS + 9_999n) / 10_000n);
  const investable = money(input.cash.currencyCode, input.cash.minorUnits > reserve.minorUnits ? input.cash.minorUnits - reserve.minorUnits : 0n);
  const gaps = new Map<string, bigint>();
  for (const asset of assets) {
    const current = state.existingMarketValueByAsset[asset.assetId] ?? 0n;
    const target = (state.decisionNavMinor * asset.targetWeightBps) / 10_000n;
    const gap = target > current ? target - current : 0n;
    gaps.set(asset.assetId, gap);
  }
  let spent = 0n;
  const orders: ProposedOrder[] = [];
  for (const asset of assets) {
    if (!asset.active) continue;
    const priceObservation = latestAvailablePrice(input.prices, asset.assetId, input.decisionTimestamp);
    if (!priceObservation) continue;
    const gap = gaps.get(asset.assetId) ?? 0n;
    if (gap <= 0n || state.decisionNavMinor <= 0n) continue;
    // Target weights are total-NAV weights; deploy only the corresponding
    // fraction of newly available investable cash. Unallocated cash remains cash.
    const allocation = (investable.minorUnits * gap) / state.decisionNavMinor;
    const candidateQuantityAtoms = (allocation * 10n ** BigInt(asset.quantityScale + priceObservation.price.priceScale)) / priceObservation.price.priceAtoms;
    const alignedQuantityAtoms = candidateQuantityAtoms - (candidateQuantityAtoms % asset.minimumQuantityIncrementAtoms);
    if (alignedQuantityAtoms <= 0n) continue;
    const candidateQuantity = quantity(asset.assetId, alignedQuantityAtoms, asset.quantityScale);
    assertQuantityIncrement(candidateQuantity, asset.minimumQuantityIncrementAtoms);
    const notional = buySettlementNotional(candidateQuantity, priceObservation.price);
    if (spent + notional.minorUnits > investable.minorUnits) continue;
    spent += notional.minorUnits;
    orders.push(Object.freeze({
      proposalId: deterministicId(`${input.decisionId}:${asset.assetId}`), financialAccountId: input.financialAccountId,
      assetId: asset.assetId, side: "BUY", orderType: "MARKET", quantity: candidateQuantity,
      referencePrice: priceObservation.price, referencePriceRecordId: priceObservation.recordId,
      referenceNotional: notional, decisionTimestamp: input.decisionTimestamp,
      strategyVersion: CONTRIBUTION_REBALANCING_VERSION, registryVersion: FIXTURE_ASSET_REGISTRY_VERSION,
      datasetVersion: FIXTURE_DATASET_VERSION,
    }));
  }
  return Object.freeze({
    decisionId: input.decisionId, financialAccountId: input.financialAccountId, strategyVersion: CONTRIBUTION_REBALANCING_VERSION,
    decisionTimestamp: input.decisionTimestamp, inputCash: input.cash, decisionNav: money(input.cash.currencyCode, state.decisionNavMinor), reserve, investableCash: investable,
    proposedOrders: Object.freeze(orders), residualCash: money(input.cash.currencyCode, investable.minorUnits - spent + reserve.minorUnits),
    targetAllocationBps: Object.freeze(Object.fromEntries(assets.map((asset) => [asset.assetId, asset.targetWeightBps.toString()]))),
  });
}
