import "server-only";

import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import postgres, { type Sql } from "postgres";

import type { RiskDecision } from "@/domain/risk/m1-risk";
import { price } from "@/domain/financial/price";
import type { FixtureAsset, FixturePriceObservation, StrategyDecision } from "@/domain/strategy/fixture-assets";

export interface PersistedDecisionResult {
  readonly decisionId: string;
  readonly financialAccountId: string;
  readonly status: "APPROVED" | "REJECTED";
  readonly proposedOrderIds: readonly string[];
}

function jsonValue(decision: StrategyDecision, risk: RiskDecision, result: PersistedDecisionResult): Record<string, unknown> {
  return {
    ...result,
    decisionId: decision.decisionId,
    inputCashMinorUnits: decision.inputCash.minorUnits.toString(),
    decisionNavMinorUnits: decision.decisionNav.minorUnits.toString(),
    reserveMinorUnits: decision.reserve.minorUnits.toString(),
    investableCashMinorUnits: decision.investableCash.minorUnits.toString(),
    residualCashMinorUnits: decision.residualCash.minorUnits.toString(),
    orders: decision.proposedOrders.map((order) => ({ proposalId: order.proposalId, assetId: order.assetId, side: order.side, orderType: order.orderType, quantityAtoms: order.quantity.atomicUnits.toString(), quantityScale: order.quantity.quantityScale, priceAtoms: order.referencePrice.priceAtoms.toString(), priceScale: order.referencePrice.priceScale, currencyCode: order.referencePrice.currencyCode, referencePriceRecordId: order.referencePriceRecordId, notionalAtoms: order.referenceNotional.minorUnits.toString(), decisionTimestamp: order.decisionTimestamp.toISOString(), strategyVersion: order.strategyVersion, registryVersion: order.registryVersion, datasetVersion: order.datasetVersion })),
    risk: { policyVersion: risk.policyVersion, disposition: risk.disposition, explanation: risk.explanation, violations: risk.violations },
  };
}

export class M1CDecisionRepository {
  private readonly client: Sql;

  constructor(connectionString: string) {
    this.client = postgres(connectionString, {
      max: 5,
      prepare: true,
      ssl: "require",
      socket: ({ host, port }: { host: string[]; port: number[] }) => {
        const hostname = host[0];
        const portNumber = port[0];
        if (!hostname || !portNumber) throw new Error("PostgreSQL host and port are required");
        const socket = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
        Object.defineProperties(socket, { host: { value: hostname, writable: true, configurable: true }, port: { value: portNumber, writable: true, configurable: true } });
        return socket;
      },
    } as Parameters<typeof postgres>[1]);
  }

  async getFixtureInputs(): Promise<{ assets: readonly FixtureAsset[]; prices: readonly FixturePriceObservation[] }> {
    const assets = await this.client<{ asset_id: string; symbol: "MM_GLOBAL" | "MM_GROWTH" | "MM_DEFENSIVE"; display_name: string; quote_currency_code: "NOK"; quantity_scale: number; minimum_quantity_increment_atoms: string; registry_version: "fixture-asset-registry/v1"; classification: "SYNTHETIC_FIXTURE"; active: boolean; target_weight_bps: string }[]>`select asset_id, symbol, display_name, quote_currency_code, quantity_scale, minimum_quantity_increment_atoms::text, registry_version, classification, active, target_weight_bps::text from public.assets where registry_version = 'fixture-asset-registry/v1' order by asset_id`;
    const prices = await this.client<{ id: string; asset_id: string; price_atoms: string; price_scale: number; currency_code: "NOK"; observed_at: Date; available_at: Date; ingested_at: Date; dataset_version: "mm-fixture-market-data/v1" }[]>`select id, asset_id, price_atoms::text, price_scale, currency_code, observed_at, available_at, ingested_at, dataset_version from public.market_prices where dataset_version = 'mm-fixture-market-data/v1' order by asset_id, available_at, observed_at, id`;
    return {
      assets: Object.freeze(assets.map((asset) => Object.freeze({ assetId: asset.asset_id, symbol: asset.symbol, displayName: asset.display_name, quoteCurrencyCode: asset.quote_currency_code, quantityScale: 4 as const, minimumQuantityIncrementAtoms: BigInt(asset.minimum_quantity_increment_atoms), classification: asset.classification, registryVersion: asset.registry_version, active: asset.active, targetWeightBps: BigInt(asset.target_weight_bps) }))),
      prices: Object.freeze(prices.map((observation) => Object.freeze({ recordId: observation.id, assetId: observation.asset_id, price: price(observation.currency_code, BigInt(observation.price_atoms), observation.price_scale), observedAt: new Date(observation.observed_at), availableAt: new Date(observation.available_at), ingestedAt: new Date(observation.ingested_at), datasetVersion: observation.dataset_version }))),
    };
  }

  async persist(decision: StrategyDecision, risk: RiskDecision, actorId: string, idempotencyKey: string, requestHash: string, occurredAt = new Date()): Promise<PersistedDecisionResult> {
    return this.client.begin(async (sql) => {
      const accounts = await sql<{ owner_id: string; status: string; mode: string }[]>`select owner_id, status, mode from public.financial_accounts where id = ${decision.financialAccountId} for update`;
      if (!accounts[0] || accounts[0].owner_id !== actorId) throw new Error("Financial account is not owned by the requesting user");
      if (accounts[0].status !== "ACTIVE" || accounts[0].mode !== "SIMULATION") throw new Error("Financial account is not an active simulation account");
      const existing = await sql<{ request_hash: string; result_json: unknown }[]>`select request_hash, result_json from public.idempotency_records where financial_account_id = ${decision.financialAccountId} and command_type = 'EVALUATE_CONTRIBUTION_DECISION' and idempotency_key = ${idempotencyKey} for update`;
      if (existing[0]) {
        if (existing[0].request_hash !== requestHash) throw new Error("Idempotency key was reused with different input");
        const stored = (typeof existing[0].result_json === "string" ? JSON.parse(existing[0].result_json) : existing[0].result_json) as Record<string, unknown>;
        if (typeof stored.decisionId !== "string" || typeof stored.financialAccountId !== "string" || (stored.status !== "APPROVED" && stored.status !== "REJECTED") || !Array.isArray(stored.proposedOrderIds)) throw new Error("Stored decision result is invalid");
        return { decisionId: stored.decisionId, financialAccountId: stored.financialAccountId, status: stored.status, proposedOrderIds: stored.proposedOrderIds.filter((value): value is string => typeof value === "string") };
      }
      const commandId = randomUUID();
      const result: PersistedDecisionResult = { decisionId: decision.decisionId, financialAccountId: decision.financialAccountId, status: risk.disposition === "APPROVE" ? "APPROVED" : "REJECTED", proposedOrderIds: decision.proposedOrders.map((order) => order.proposalId) };
      await sql`insert into public.idempotency_records (id, financial_account_id, command_type, idempotency_key, request_hash, result_json) values (${commandId}, ${decision.financialAccountId}, 'EVALUATE_CONTRIBUTION_DECISION', ${idempotencyKey}, ${requestHash}, ${JSON.stringify(jsonValue(decision, risk, result))}::jsonb)`;
      await sql`insert into public.strategy_decisions (id, financial_account_id, actor_id, idempotency_record_id, decision_timestamp, strategy_version, risk_policy_version, asset_registry_version, dataset_version, input_cash_atoms, reserve_atoms, status, result_json) values (${decision.decisionId}, ${decision.financialAccountId}, ${actorId}, ${commandId}, ${decision.decisionTimestamp}, ${decision.strategyVersion}, ${risk.policyVersion}, ${decision.proposedOrders[0]?.registryVersion ?? 'fixture-asset-registry/v1'}, ${decision.proposedOrders[0]?.datasetVersion ?? 'mm-fixture-market-data/v1'}, ${decision.inputCash.minorUnits.toString()}::numeric, ${decision.reserve.minorUnits.toString()}::numeric, ${risk.disposition === "APPROVE" ? "APPROVED" : "REJECTED"}, ${JSON.stringify(jsonValue(decision, risk, result))}::jsonb)`;
      for (const order of decision.proposedOrders) await sql`insert into public.proposed_orders (id, strategy_decision_id, financial_account_id, asset_id, side, order_type, quantity_atoms, quantity_scale, price_atoms, price_scale, currency_code, reference_price_id, reference_notional_atoms, decision_timestamp, strategy_version, registry_version, dataset_version) values (${order.proposalId}, ${decision.decisionId}, ${decision.financialAccountId}, ${order.assetId}, ${order.side}, ${order.orderType}, ${order.quantity.atomicUnits.toString()}::numeric, ${order.quantity.quantityScale}, ${order.referencePrice.priceAtoms.toString()}::numeric, ${order.referencePrice.priceScale}, ${order.referencePrice.currencyCode}, ${order.referencePriceRecordId}, ${order.referenceNotional.minorUnits.toString()}::numeric, ${order.decisionTimestamp}, ${order.strategyVersion}, ${order.registryVersion}, ${order.datasetVersion})`;
      const assessmentId = randomUUID();
      await sql`insert into public.risk_assessments (id, strategy_decision_id, financial_account_id, policy_version, disposition, explanation) values (${assessmentId}, ${decision.decisionId}, ${decision.financialAccountId}, ${risk.policyVersion}, ${risk.disposition}, ${risk.explanation})`;
      for (const item of risk.violations) await sql`insert into public.risk_violations (risk_assessment_id, code, message, evidence) values (${assessmentId}, ${item.code}, ${item.message}, ${JSON.stringify(item.evidence)}::jsonb)`;
      await sql`insert into public.decision_audit_events (financial_account_id, actor_id, decision_id, command_id, command_type, idempotency_key, outcome, evidence, occurred_at) values (${decision.financialAccountId}, ${actorId}, ${decision.decisionId}, ${commandId}, 'EVALUATE_CONTRIBUTION_DECISION', ${idempotencyKey}, ${risk.disposition === "APPROVE" ? "APPROVED" : "REJECTED"}, ${JSON.stringify(jsonValue(decision, risk, result))}::jsonb, ${occurredAt})`;
      return result;
    });
  }

  async close(): Promise<void> { await this.client.end({ timeout: 5 }); }
}
