import "server-only";
import { createConnection } from "node:net";
import postgres, { type Sql } from "postgres";
import type { PortfolioReadRepository } from "@/application/portfolio/get-portfolio-projection";
import type { PortfolioEvidence } from "@/domain/portfolio/portfolio-projection";
import { assertCurrencyCode } from "@/domain/financial/currency";
import { price } from "@/domain/financial/price";
import { FIXTURE_ASSET_REGISTRY_VERSION, FIXTURE_DATASET_VERSION } from "@/domain/strategy/fixture-assets";

export class PostgresPortfolioReadRepository implements PortfolioReadRepository {
  private readonly client: Sql;
  constructor(url: string) {
    // Same proven hostname-preserving IPv4/TLS path as M1B–M1D.
    this.client = postgres(url, { max: 5, prepare: true, ssl: "require", socket: ({ host, port }: { host: string[]; port: number[] }) => {
      const hostname = host[0]; const portNumber = port[0];
      if (!hostname || !portNumber) throw new Error("PostgreSQL host and port are required");
      const socket = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
      Object.defineProperties(socket, { host: { value: hostname, writable: true, configurable: true }, port: { value: portNumber, writable: true, configurable: true } });
      return socket;
    } } as Parameters<typeof postgres>[1]);
  }

  async loadOwnedEvidence(actorId: string, accountId: string | undefined, asOf: Date): Promise<PortfolioEvidence | undefined> {
    const [result] = await this.client.begin(async tx => {
      await tx`set transaction isolation level repeatable read, read only`;
      // RLS is exercised even though the server connection can otherwise be privileged.
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub', ${actorId}, true)`;
      const accounts = await tx`select id, base_currency_code from public.financial_accounts where owner_id = ${actorId} and mode = 'SIMULATION' and (${accountId ?? null}::uuid is null and is_default_simulation or id = ${accountId ?? null}::uuid) limit 1`;
      const account = accounts[0]; if (!account) return [undefined];
      assertCurrencyCode(account.base_currency_code);
      const ledgerRows = await tx`select le.id, lt.id transaction_id, lt.financial_account_id, la.code, la.commodity_kind, la.commodity_currency_code, la.commodity_asset_id, le.direction, le.amount_atoms::text, lt.occurred_at, lt.recorded_at from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id join public.ledger_accounts la on la.id = le.ledger_account_id where lt.financial_account_id = ${account.id} and la.financial_account_id = ${account.id} and lt.occurred_at <= ${asOf} and lt.recorded_at <= ${asOf} order by le.id`;
      const fillRows = await tx`select sf.id, sf.simulation_execution_id, sf.ledger_transaction_id, sf.financial_account_id, po.asset_id, sf.quantity_atoms::text, sf.quantity_scale, sf.currency_code, sf.gross_notional_atoms::text, sf.fee_atoms::text, sf.execution_timestamp, greatest(sf.created_at, se.created_at) recorded_at, sf.execution_policy_version,
        (se.state = 'FILLED' and se.financial_account_id = sf.financial_account_id and po.financial_account_id = sf.financial_account_id and se.proposed_order_id = sf.proposed_order_id and se.ledger_transaction_id = sf.ledger_transaction_id and se.quantity_atoms = sf.quantity_atoms and se.quantity_scale = sf.quantity_scale and se.gross_notional_atoms = sf.gross_notional_atoms and se.fee_atoms = sf.fee_atoms and se.currency_code = sf.currency_code and se.total_cash_debit_atoms = sf.gross_notional_atoms + sf.fee_atoms and sf.total_cash_debit_atoms = se.total_cash_debit_atoms and se.execution_timestamp = sf.execution_timestamp and se.execution_policy_version = sf.execution_policy_version) execution_matches_fill
        from public.simulation_fills sf join public.simulation_executions se on se.id = sf.simulation_execution_id join public.proposed_orders po on po.id = sf.proposed_order_id where sf.financial_account_id = ${account.id} and sf.execution_timestamp <= ${asOf} and se.execution_timestamp <= ${asOf} and sf.created_at <= ${asOf} and se.created_at <= ${asOf} order by sf.execution_timestamp, sf.id`;
      const assetIds = [...new Set([...ledgerRows.filter(r => r.commodity_kind === "ASSET").map(r => r.commodity_asset_id as string), ...fillRows.map(r => r.asset_id as string)])];
      // No assets means no metadata/price query is required.
      const assets = assetIds.length ? await tx`select * from public.assets where asset_id in ${tx(assetIds)} and registry_version = ${FIXTURE_ASSET_REGISTRY_VERSION}` : [];
      const prices = assetIds.length ? await tx`select distinct on (asset_id) id, asset_id, price_atoms::text, price_scale, currency_code, observed_at, available_at, ingested_at, dataset_version from public.market_prices where asset_id in ${tx(assetIds)} and available_at <= ${asOf} and dataset_version = ${FIXTURE_DATASET_VERSION} and currency_code = ${account.base_currency_code} order by asset_id, available_at desc, observed_at desc, id desc` : [];
      const evidence: PortfolioEvidence = {
        financialAccountId: account.id, baseCurrency: account.base_currency_code,
        ledger: ledgerRows.map(r => ({ entryId: r.id, transactionId: r.transaction_id, financialAccountId: r.financial_account_id, code: r.code, commodityKind: r.commodity_kind, currency: r.commodity_currency_code, assetId: r.commodity_asset_id, direction: r.direction, amountAtoms: BigInt(r.amount_atoms), occurredAt: new Date(r.occurred_at), recordedAt: new Date(r.recorded_at) })),
        acquisitions: fillRows.map(r => ({ fillId: r.id, executionId: r.simulation_execution_id, ledgerTransactionId: r.ledger_transaction_id, financialAccountId: r.financial_account_id, assetId: r.asset_id, quantityAtoms: BigInt(r.quantity_atoms), quantityScale: r.quantity_scale, currency: r.currency_code, grossMinor: BigInt(r.gross_notional_atoms), feeMinor: BigInt(r.fee_atoms), executedAt: new Date(r.execution_timestamp), recordedAt: new Date(r.recorded_at), executionPolicyVersion: r.execution_policy_version, executionMatchesFill: r.execution_matches_fill })),
        assets: assets.map(r => ({ assetId: r.asset_id, symbol: r.symbol, displayName: r.display_name, quoteCurrencyCode: r.quote_currency_code, quantityScale: r.quantity_scale, minimumQuantityIncrementAtoms: BigInt(r.minimum_quantity_increment_atoms), classification: r.classification, registryVersion: r.registry_version, active: r.active, targetWeightBps: BigInt(r.target_weight_bps) })),
        prices: prices.map(r => ({ recordId: r.id, assetId: r.asset_id, price: price(account.base_currency_code, BigInt(r.price_atoms), r.price_scale), observedAt: new Date(r.observed_at), availableAt: new Date(r.available_at), ingestedAt: new Date(r.ingested_at), datasetVersion: r.dataset_version })),
      };
      return [evidence];
    });
    return result as PortfolioEvidence | undefined;
  }
  async close() { await this.client.end({ timeout: 5 }); }
}

let repository: PostgresPortfolioReadRepository | undefined;
export function getPortfolioReadRepository() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  return repository ??= new PostgresPortfolioReadRepository(url);
}
