import "server-only";

import { createConnection } from "node:net";
import postgres, { type Sql } from "postgres";

import type { AuditEvent, CreateVirtualDepositResult, FinancialAccount, FinancialRepository, FinancialTransactionStore, IdempotencyRecord } from "@/application/deposits/contracts";
import { assertCurrencyCode, type CurrencyCode } from "@/domain/financial/currency";
import { money, moneyFromDto, moneyToDto, type Money } from "@/domain/financial/money";
import { PostgresPortfolioReadRepository } from "@/infrastructure/postgres/portfolio-read-repository";
import type { DecisionPortfolioState } from "@/domain/strategy/fixture-assets";
import type { LedgerAccount, LedgerAccountClass, LedgerCommodity, LedgerDirection, LedgerEntry, LedgerTransaction } from "@/domain/ledger/ledger";

type DatabaseFinancialAccount = {
  id: string;
  owner_id: string;
  base_currency_code: string;
  mode: "SIMULATION" | "PAPER";
  status: "ACTIVE" | "CLOSED";
};

type DatabaseLedgerAccount = {
  id: string;
  financial_account_id: string;
  code: string;
  account_class: LedgerAccountClass;
  normal_balance: LedgerDirection;
  commodity_kind: "MONEY" | "ASSET";
  commodity_currency_code: string | null;
  commodity_asset_id: string | null;
};

type DatabaseLedgerEntry = DatabaseLedgerAccount & {
  direction: LedgerDirection;
  amount_atoms: string;
};

export interface RecentLedgerActivity {
  readonly ledgerTransactionId: string;
  readonly type: "VIRTUAL_DEPOSIT" | "REVERSAL";
  readonly narrative: string;
  readonly occurredAt: Date;
  readonly amount: Money;
}

export interface FinancialAccountOverview {
  readonly account: FinancialAccount;
  readonly availableCash: Money;
  readonly recentActivity: readonly RecentLedgerActivity[];
}

function asCurrencyCode(value: string): CurrencyCode {
  assertCurrencyCode(value);
  return value;
}

function mapFinancialAccount(row: DatabaseFinancialAccount): FinancialAccount {
  return Object.freeze({
    id: row.id,
    ownerId: row.owner_id,
    baseCurrencyCode: asCurrencyCode(row.base_currency_code),
    mode: row.mode,
    status: row.status,
  });
}

function mapLedgerAccount(row: DatabaseLedgerAccount): LedgerAccount {
  let commodity: LedgerCommodity;
  if (row.commodity_kind === "MONEY") {
    if (!row.commodity_currency_code) throw new Error("Database ledger account is missing money currency");
    commodity = { kind: "MONEY", currencyCode: asCurrencyCode(row.commodity_currency_code) };
  } else {
    if (!row.commodity_asset_id) throw new Error("Database ledger account is missing asset identifier");
    commodity = { kind: "ASSET", assetId: row.commodity_asset_id };
  }

  return Object.freeze({
    id: row.id,
    financialAccountId: row.financial_account_id,
    code: row.code,
    accountClass: row.account_class,
    normalBalance: row.normal_balance,
    commodity,
  });
}

function mapLedgerEntry(row: DatabaseLedgerEntry): LedgerEntry {
  return Object.freeze({
    ledgerAccount: mapLedgerAccount(row),
    direction: row.direction,
    amountAtoms: BigInt(row.amount_atoms),
  });
}

function serializeDepositResult(result: CreateVirtualDepositResult): Record<string, unknown> {
  return {
    commandId: result.commandId,
    ledgerTransactionId: result.ledgerTransactionId,
    financialAccountId: result.financialAccountId,
    depositedAmount: moneyToDto(result.depositedAmount),
    availableCash: moneyToDto(result.availableCash),
  };
}

function deserializeDepositResult(value: unknown): CreateVirtualDepositResult {
  const decoded = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!decoded || typeof decoded !== "object") throw new Error("Stored idempotency result is invalid");
  const result = decoded as Record<string, unknown>;
  if (typeof result.commandId !== "string" || typeof result.ledgerTransactionId !== "string" || typeof result.financialAccountId !== "string") {
    throw new Error("Stored idempotency result is incomplete");
  }

  return Object.freeze({
    commandId: result.commandId,
    ledgerTransactionId: result.ledgerTransactionId,
    financialAccountId: result.financialAccountId,
    depositedAmount: moneyFromDto(result.depositedAmount as { currencyCode: CurrencyCode; minorUnits: string }),
    availableCash: moneyFromDto(result.availableCash as { currencyCode: CurrencyCode; minorUnits: string }),
  });
}

class PostgresTransactionStore implements FinancialTransactionStore {
  constructor(private readonly sql: Sql) {}

  async getFinancialAccount(id: string): Promise<FinancialAccount | undefined> {
    // This narrow lock serializes monetary commands for one FinancialAccount.
    // The unique idempotency constraint remains the independent final guard.
    const rows = await this.sql<DatabaseFinancialAccount[]>`
      select id, owner_id, base_currency_code, mode, status
      from public.financial_accounts
      where id = ${id}
      for update
    `;
    return rows[0] ? mapFinancialAccount(rows[0]) : undefined;
  }

  async getIdempotencyRecord<T>(financialAccountId: string, commandType: "CREATE_VIRTUAL_DEPOSIT", idempotencyKey: string): Promise<IdempotencyRecord<T> | undefined> {
    const rows = await this.sql<{ id: string; financial_account_id: string; command_type: "CREATE_VIRTUAL_DEPOSIT"; idempotency_key: string; request_hash: string; result_json: unknown }[]>`
      select id, financial_account_id, command_type, idempotency_key, request_hash, result_json
      from public.idempotency_records
      where financial_account_id = ${financialAccountId}
        and command_type = ${commandType}
        and idempotency_key = ${idempotencyKey}
    `;
    const row = rows[0];
    if (!row) return undefined;
    return Object.freeze({
      id: row.id,
      financialAccountId: row.financial_account_id,
      commandType: row.command_type,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      result: deserializeDepositResult(row.result_json) as T,
    });
  }

  async getLedgerAccount(financialAccountId: string, code: string): Promise<LedgerAccount | undefined> {
    const rows = await this.sql<DatabaseLedgerAccount[]>`
      select id, financial_account_id, code, account_class, normal_balance,
             commodity_kind, commodity_currency_code, commodity_asset_id
      from public.ledger_accounts
      where financial_account_id = ${financialAccountId} and code = ${code}
    `;
    return rows[0] ? mapLedgerAccount(rows[0]) : undefined;
  }

  async listLedgerEntries(financialAccountId: string): Promise<readonly LedgerEntry[]> {
    const rows = await this.sql<DatabaseLedgerEntry[]>`
      select la.id, la.financial_account_id, la.code, la.account_class, la.normal_balance,
             la.commodity_kind, la.commodity_currency_code, la.commodity_asset_id,
             le.direction, le.amount_atoms::text
      from public.ledger_entries le
      join public.ledger_transactions lt on lt.id = le.ledger_transaction_id
      join public.ledger_accounts la on la.id = le.ledger_account_id
      where lt.financial_account_id = ${financialAccountId}
      order by lt.occurred_at, lt.id, le.id
    `;
    return rows.map(mapLedgerEntry);
  }

  async insertIdempotencyRecord<T>(record: IdempotencyRecord<T>): Promise<void> {
    const result = serializeDepositResult(record.result as CreateVirtualDepositResult);
    await this.sql`
      insert into public.idempotency_records (
        id, financial_account_id, command_type, idempotency_key, request_hash, result_json
      ) values (
        ${record.id}, ${record.financialAccountId}, ${record.commandType}, ${record.idempotencyKey},
        ${record.requestHash}, ${JSON.stringify(result)}::jsonb
      )
    `;
  }

  async insertLedgerTransaction(transaction: LedgerTransaction): Promise<void> {
    await this.sql`
      insert into public.ledger_transactions (
        id, financial_account_id, idempotency_record_id, transaction_type,
        occurred_at, narrative, reversal_of_transaction_id
      ) values (
        ${transaction.id}, ${transaction.financialAccountId}, ${transaction.idempotencyRecordId ?? null},
        ${transaction.type}, ${transaction.occurredAt}, ${transaction.narrative},
        ${transaction.reversalOfTransactionId ?? null}
      )
    `;

    for (const entry of transaction.entries) {
      await this.sql`
        insert into public.ledger_entries (
          ledger_transaction_id, ledger_account_id, direction, amount_atoms
        ) values (
          ${transaction.id}, ${entry.ledgerAccount.id}, ${entry.direction}, ${entry.amountAtoms.toString()}::numeric
        )
      `;
    }
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    await this.sql`
      insert into public.audit_events (
        id, financial_account_id, actor_id, command_id, command_type,
        idempotency_key, outcome, policy_versions, ledger_transaction_id, occurred_at
      ) values (
        ${event.id}, ${event.financialAccountId}, ${event.actorId}, ${event.commandId},
        ${event.commandType}, ${event.idempotencyKey}, ${event.outcome},
        ${JSON.stringify(event.policyVersions)}::jsonb, ${event.ledgerTransactionId}, ${event.occurredAt}
      )
    `;
  }
}

/**
 * Server-only adapter for a direct PostgreSQL connection (including Supabase
 * PostgreSQL). It deliberately does not use PostgREST because one financial
 * command requires a single database transaction across several tables.
 */
export class PostgresFinancialRepository implements FinancialRepository {
  private readonly client: Sql;
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    // Supabase's shared Session Pooler is IPv4-backed. In this environment,
    // postgres.js hostname sockets can stall during family selection even
    // though Node DNS/TLS and direct IPv4 connections are healthy. Keep the
    // hostname (and therefore normal DNS/SNI) while explicitly selecting IPv4
    // for this socket only. This avoids hardcoding an ephemeral ELB address.
    const options = {
      max: 5,
      prepare: true,
      ssl: "require" as const,
      socket: ({ host, port }: { host: string[]; port: number[] }) => {
        const hostname = host[0];
        const portNumber = port[0];
        if (!hostname || !portNumber) throw new Error("PostgreSQL host and port are required");
        const socket = createConnection({
          host: hostname,
          port: portNumber,
          family: 4,
          autoSelectFamily: false,
        });
        // postgres.js uses these properties to set TLS SNI when a custom
        // socket factory is supplied. Preserve the configured hostname.
        Object.defineProperties(socket, {
          host: { value: hostname, writable: true, configurable: true },
          port: { value: portNumber, writable: true, configurable: true },
        });
        return socket;
      },
    } as Parameters<typeof postgres>[1];
    this.client = postgres(connectionString, options);
  }

  async transaction<T>(operation: (store: FinancialTransactionStore) => Promise<T> | T): Promise<T> {
    const [result] = await this.client.begin(async (sql) => {
      // Read committed plus SELECT ... FOR UPDATE is intentional here. A
      // waiting duplicate command sees the committed idempotency record after
      // the account lock is released, instead of failing on a serializable
      // snapshot retry. The unique database constraint is a second safeguard.
      await sql`set transaction isolation level read committed`;
      return [await operation(new PostgresTransactionStore(sql))];
    });
    // postgres.js conditionally unwraps promise/array callback values in its
    // public type. The callback above returns exactly one resolved T value.
    return result as T;
  }

  async getOrCreateDefaultSimulationAccount(ownerId: string): Promise<FinancialAccount> {
    return this.client.begin(async (sql) => {
      await sql`insert into public.profiles (id) values (${ownerId}) on conflict (id) do nothing`;
      const created = await sql<DatabaseFinancialAccount[]>`
        insert into public.financial_accounts (
          owner_id, base_currency_code, mode, status, is_default_simulation
        ) values (${ownerId}, 'NOK', 'SIMULATION', 'ACTIVE', true)
        on conflict (owner_id) where (mode = 'SIMULATION' and is_default_simulation)
        do nothing
        returning id, owner_id, base_currency_code, mode, status
      `;
      if (created[0]) return mapFinancialAccount(created[0]);

      const existing = await sql<DatabaseFinancialAccount[]>`
        select id, owner_id, base_currency_code, mode, status
        from public.financial_accounts
        where owner_id = ${ownerId} and mode = 'SIMULATION' and is_default_simulation
        for update
      `;
      if (!existing[0]) throw new Error("Default simulation FinancialAccount could not be provisioned");
      return mapFinancialAccount(existing[0]);
    });
  }

  async getFinancialAccountOverview(financialAccountId: string, ownerId: string): Promise<FinancialAccountOverview | undefined> {
    const accounts = await this.client<DatabaseFinancialAccount[]>`
      select id, owner_id, base_currency_code, mode, status
      from public.financial_accounts
      where id = ${financialAccountId} and owner_id = ${ownerId}
    `;
    const account = accounts[0];
    if (!account) return undefined;
    const mappedAccount = mapFinancialAccount(account);

    const cashRows = await this.client<{ amount_atoms: string }[]>`
      select coalesce(sum(
        case when le.direction = la.normal_balance then le.amount_atoms else -le.amount_atoms end
      ), 0)::text as amount_atoms
      from public.ledger_entries le
      join public.ledger_transactions lt on lt.id = le.ledger_transaction_id
      join public.ledger_accounts la on la.id = le.ledger_account_id
      where lt.financial_account_id = ${financialAccountId}
        and la.code = 'CASH'
        and la.commodity_kind = 'MONEY'
        and la.commodity_currency_code = ${mappedAccount.baseCurrencyCode}
    `;

    const activityRows = await this.client<{ id: string; transaction_type: "VIRTUAL_DEPOSIT" | "REVERSAL"; narrative: string; occurred_at: Date; amount_atoms: string }[]>`
      select lt.id, lt.transaction_type, lt.narrative, lt.occurred_at, le.amount_atoms::text
      from public.ledger_transactions lt
      join public.ledger_entries le on le.ledger_transaction_id = lt.id
      join public.ledger_accounts la on la.id = le.ledger_account_id
      where lt.financial_account_id = ${financialAccountId}
        and la.code = 'CASH'
        and le.direction = 'DEBIT'
      order by lt.occurred_at desc, lt.id desc
      limit 10
    `;

    return Object.freeze({
      account: mappedAccount,
      availableCash: money(mappedAccount.baseCurrencyCode, BigInt(cashRows[0]?.amount_atoms ?? "0")),
      recentActivity: Object.freeze(activityRows.map((row) => Object.freeze({
        ledgerTransactionId: row.id,
        type: row.transaction_type,
        narrative: row.narrative,
        occurredAt: new Date(row.occurred_at),
        amount: money(mappedAccount.baseCurrencyCode, BigInt(row.amount_atoms)),
      }))),
    });
  }

  async getDecisionPortfolioState(financialAccountId: string, ownerId: string, asOf: Date): Promise<DecisionPortfolioState | undefined> {
    const reader = new PostgresPortfolioReadRepository(this.connectionString);
    try {
      const evidence = await reader.loadOwnedEvidence(ownerId, financialAccountId, asOf);
      if (!evidence) return undefined;
      const { projectPortfolio } = await import("@/domain/portfolio/portfolio-projection");
      const projection = projectPortfolio(evidence, asOf);
      if (projection.valuationStatus !== "COMPLETE" || projection.nav === null) throw new Error("DECISION_PORTFOLIO_INCOMPLETE");
      return Object.freeze({
        cashMinor: BigInt(projection.cash), decisionNavMinor: BigInt(projection.nav),
        holdings: Object.freeze(projection.holdings.filter(h => BigInt(h.quantityAtoms) !== 0n && h.marketValueMinor !== null).map(h => Object.freeze({ assetId: h.assetId, marketValueMinor: BigInt(h.marketValueMinor!) }))),
        existingMarketValueByAsset: Object.freeze(Object.fromEntries(projection.holdings.filter(h => h.marketValueMinor !== null).map(h => [h.assetId, BigInt(h.marketValueMinor!)]))),
        priceRecordIds: Object.freeze(projection.provenance.priceRecordIds),
      });
    } finally { await reader.close(); }
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

let repository: PostgresFinancialRepository | undefined;

/** Returns undefined when no server-only DATABASE_URL is configured. */
export function getPostgresFinancialRepository(): PostgresFinancialRepository | undefined {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return undefined;
  repository ??= new PostgresFinancialRepository(connectionString);
  return repository;
}
