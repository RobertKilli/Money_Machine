import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CreateVirtualDeposit } from "@/application/deposits/create-virtual-deposit";
import type { FinancialRepository, FinancialTransactionStore } from "@/application/deposits/contracts";
import { money } from "@/domain/financial/money";
import { PostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";

const PROJECT_REF = "flsfallpputejojncyue";
const runId = randomUUID();
const ownerA = randomUUID();
const ownerB = randomUUID();
const testEmailSuffix = runId.replaceAll("-", "");

let sql!: Sql;
let repository!: PostgresFinancialRepository;
let connectionInitialized = false;
let accountAId: string;
let accountBId: string;
let firstDepositTransactionId: string;
let firstDepositAuditEventId: string;

function ipv4Socket({ host, port }: { host: string[]; port: number[] }) {
  const hostname = host[0];
  const portNumber = port[0];
  if (!hostname || !portNumber) throw new Error("PostgreSQL host and port are required");
  const socket = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
  Object.defineProperties(socket, {
    host: { value: hostname, writable: true, configurable: true },
    port: { value: portNumber, writable: true, configurable: true },
  });
  return socket;
}

function requiredIntegrationDatabaseUrl(): string {
  if (process.env.MONEY_MACHINE_INTEGRATION_TEST !== "1") {
    throw new Error("Refusing database integration tests: set MONEY_MACHINE_INTEGRATION_TEST=1 explicitly.");
  }
  if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== PROJECT_REF) {
    throw new Error("Refusing database integration tests: explicit project reference does not match Money Machine development.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Refusing database integration tests: DATABASE_URL is required.");
  // Do not print the URL. The project ref check is a second guard against an
  // accidental production or unrelated test target.
  if (!databaseUrl.includes(PROJECT_REF)) {
    throw new Error("Refusing database integration tests: DATABASE_URL is not the authorized Money Machine project.");
  }
  return databaseUrl;
}

async function createDevelopmentIdentity(id: string, email: string): Promise<void> {
  await sql`
    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      ${id}, 'authenticated', 'authenticated', ${email}, '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    )
  `;
}

async function financialAccountLedgerAccounts(financialAccountId: string): Promise<{ cashId: string; contributedCapitalId: string }> {
  const rows = await sql<{ id: string; code: string; account_class: string; normal_balance: string; commodity_currency_code: string }[]>`
    select id, code, account_class, normal_balance, commodity_currency_code
    from public.ledger_accounts
    where financial_account_id = ${financialAccountId}
      and code in ('CASH', 'VIRTUAL_CONTRIBUTED_CAPITAL')
    order by code
  `;
  const cash = rows.find((row) => row.code === "CASH");
  const capital = rows.find((row) => row.code === "VIRTUAL_CONTRIBUTED_CAPITAL");
  expect(cash).toMatchObject({ account_class: "ASSET", normal_balance: "DEBIT", commodity_currency_code: "NOK" });
  expect(capital).toMatchObject({ account_class: "EQUITY", normal_balance: "CREDIT", commodity_currency_code: "NOK" });
  if (!cash || !capital) throw new Error("Default ledger accounts were not provisioned");
  return { cashId: cash.id, contributedCapitalId: capital.id };
}

function commandInput(idempotencyKey: string, amountAtoms = 100_000n) {
  return {
    actorId: ownerA,
    financialAccountId: accountAId,
    amount: money("NOK", amountAtoms),
    idempotencyKey,
    occurredAt: new Date("2026-09-09T22:00:00.000Z"),
  };
}

describe("Money Machine PostgreSQL financial foundation", () => {
  beforeAll(async () => {
    sql = postgres(requiredIntegrationDatabaseUrl(), { max: 4, prepare: true, ssl: "require", socket: ipv4Socket } as Parameters<typeof postgres>[1]);
    repository = new PostgresFinancialRepository(requiredIntegrationDatabaseUrl());
    connectionInitialized = true;
    await createDevelopmentIdentity(ownerA, `m1b5-a-${testEmailSuffix}@example.invalid`);
    await createDevelopmentIdentity(ownerB, `m1b5-b-${testEmailSuffix}@example.invalid`);
  });

  afterAll(async () => {
    if (!connectionInitialized) return;
    await repository.close();
    await sql.end({ timeout: 5 });
  });

  it("provisions one active NOK simulation FinancialAccount and canonical ledger accounts", async () => {
    const first = await repository.getOrCreateDefaultSimulationAccount(ownerA);
    const second = await repository.getOrCreateDefaultSimulationAccount(ownerA);
    accountAId = first.id;
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ ownerId: ownerA, baseCurrencyCode: "NOK", mode: "SIMULATION", status: "ACTIVE" });
    await financialAccountLedgerAccounts(accountAId);

    const accountB = await repository.getOrCreateDefaultSimulationAccount(ownerB);
    accountBId = accountB.id;
    await financialAccountLedgerAccounts(accountBId);
  });

  it("posts one real 1,000.00 NOK virtual deposit with ledger-derived cash and immutable audit evidence", async () => {
    const idempotencyKey = `m1b5-deposit-${runId}`;
    const result = await new CreateVirtualDeposit(repository).execute(commandInput(idempotencyKey));
    firstDepositTransactionId = result.ledgerTransactionId;
    expect(result.availableCash.minorUnits).toBe(100_000n);

    const persisted = await sql<{ id: string; transaction_id: string; audit_id: string; entry_count: string }[]>`
      select ir.id, lt.id as transaction_id, ae.id as audit_id, count(le.id)::text as entry_count
      from public.idempotency_records ir
      join public.ledger_transactions lt on lt.idempotency_record_id = ir.id
      join public.ledger_entries le on le.ledger_transaction_id = lt.id
      join public.audit_events ae on ae.command_id = ir.id
      where ir.financial_account_id = ${accountAId}
        and ir.command_type = 'CREATE_VIRTUAL_DEPOSIT'
        and ir.idempotency_key = ${idempotencyKey}
      group by ir.id, lt.id, ae.id
    `;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.entry_count).toBe("2");
    firstDepositAuditEventId = persisted[0]!.audit_id;

    const overview = await repository.getFinancialAccountOverview(accountAId, ownerA);
    expect(overview?.availableCash.minorUnits).toBe(100_000n);
  });

  it("returns the original result for an equal retry and rejects conflicting idempotency input", async () => {
    const idempotencyKey = `m1b5-deposit-${runId}`;
    const original = await new CreateVirtualDeposit(repository).execute(commandInput(idempotencyKey));
    expect(original.ledgerTransactionId).toBe(firstDepositTransactionId);
    await expect(new CreateVirtualDeposit(repository).execute(commandInput(idempotencyKey, 100_001n))).rejects.toThrow("different input");

    const overview = await repository.getFinancialAccountOverview(accountAId, ownerA);
    expect(overview?.availableCash.minorUnits).toBe(100_000n);
  });

  it("serializes concurrent duplicate deposits to one financial effect", async () => {
    const idempotencyKey = `m1b5-concurrent-${runId}`;
    const command = new CreateVirtualDeposit(repository);
    const input = commandInput(idempotencyKey, 50_000n);
    const [first, second] = await Promise.all([command.execute(input), command.execute(input)]);
    expect(second).toEqual(first);

    const records = await sql<{ count: string }[]>`
      select count(*)::text as count from public.idempotency_records
      where financial_account_id = ${accountAId} and command_type = 'CREATE_VIRTUAL_DEPOSIT' and idempotency_key = ${idempotencyKey}
    `;
    expect(records[0]?.count).toBe("1");
    const overview = await repository.getFinancialAccountOverview(accountAId, ownerA);
    expect(overview?.availableCash.minorUnits).toBe(150_000n);
  });

  it("rolls back idempotency, journal, audit, and cash when persistence fails after the idempotency write", async () => {
    const idempotencyKey = `m1b5-rollback-${runId}`;
    const failingRepository: FinancialRepository = {
      transaction: (operation) => repository.transaction(async (store) => operation({
        getFinancialAccount: (id) => store.getFinancialAccount(id),
        getIdempotencyRecord: <T>(accountId: string, commandType: "CREATE_VIRTUAL_DEPOSIT", key: string) => store.getIdempotencyRecord<T>(accountId, commandType, key),
        getLedgerAccount: (accountId, code) => store.getLedgerAccount(accountId, code),
        listLedgerEntries: (accountId) => store.listLedgerEntries(accountId),
        insertIdempotencyRecord: <T>(record: Parameters<FinancialTransactionStore["insertIdempotencyRecord"]>[0] & { result: T }) => store.insertIdempotencyRecord(record),
        insertLedgerTransaction: async () => { throw new Error("controlled integration persistence failure"); },
        insertAuditEvent: (event) => store.insertAuditEvent(event),
      })),
    };
    await expect(new CreateVirtualDeposit(failingRepository).execute(commandInput(idempotencyKey, 10_000n))).rejects.toThrow("controlled integration persistence failure");

    const residual = await sql<{ idempotency: string; journals: string; audits: string }[]>`
      select
        (select count(*)::text from public.idempotency_records where financial_account_id = ${accountAId} and idempotency_key = ${idempotencyKey}) as idempotency,
        (select count(*)::text from public.ledger_transactions lt join public.idempotency_records ir on ir.id = lt.idempotency_record_id where ir.financial_account_id = ${accountAId} and ir.idempotency_key = ${idempotencyKey}) as journals,
        (select count(*)::text from public.audit_events where financial_account_id = ${accountAId} and idempotency_key = ${idempotencyKey}) as audits
    `;
    expect(residual[0]).toEqual({ idempotency: "0", journals: "0", audits: "0" });
    const overview = await repository.getFinancialAccountOverview(accountAId, ownerA);
    expect(overview?.availableCash.minorUnits).toBe(150_000n);
  });

  it("commits a balanced three-entry journal and rejects a globally-zero but per-commodity-unbalanced journal", async () => {
    const { cashId, contributedCapitalId } = await financialAccountLedgerAccounts(accountBId);
    const balancedIdempotencyId = randomUUID();
    const balancedTransactionId = randomUUID();
    await sql.begin(async (transaction) => {
      await transaction`insert into public.idempotency_records (id, financial_account_id, command_type, idempotency_key, request_hash, result_json) values (${balancedIdempotencyId}, ${accountBId}, 'CREATE_VIRTUAL_DEPOSIT', ${`m1b5-multiple-${runId}`}, ${"a".repeat(64)}, '{}'::jsonb)`;
      await transaction`insert into public.ledger_transactions (id, financial_account_id, idempotency_record_id, transaction_type, occurred_at, narrative) values (${balancedTransactionId}, ${accountBId}, ${balancedIdempotencyId}, 'VIRTUAL_DEPOSIT', now(), 'M1B.5 balanced multi-entry validation')`;
      await transaction`insert into public.ledger_entries (ledger_transaction_id, ledger_account_id, direction, amount_atoms) values (${balancedTransactionId}, ${cashId}, 'DEBIT', 100), (${balancedTransactionId}, ${cashId}, 'DEBIT', 200), (${balancedTransactionId}, ${contributedCapitalId}, 'CREDIT', 300)`;
      await transaction`insert into public.audit_events (financial_account_id, actor_id, command_id, command_type, idempotency_key, outcome, policy_versions, ledger_transaction_id, occurred_at) values (${accountBId}, ${ownerB}, ${balancedIdempotencyId}, 'CREATE_VIRTUAL_DEPOSIT', ${`m1b5-multiple-${runId}`}, 'SUCCEEDED', '{}'::jsonb, ${balancedTransactionId}, now())`;
    });
    const balancedEntries = await sql<{ count: string }[]>`select count(*)::text as count from public.ledger_entries where ledger_transaction_id = ${balancedTransactionId}`;
    expect(balancedEntries[0]?.count).toBe("3");

    const unbalancedKey = `m1b5-commodity-unbalanced-${runId}`;
    await expect(sql.begin(async (transaction) => {
      const idempotencyId = randomUUID();
      const transactionId = randomUUID();
      const usdAssetId = randomUUID();
      const usdEquityId = randomUUID();
      await transaction`insert into public.ledger_accounts (id, financial_account_id, code, account_class, normal_balance, commodity_kind, commodity_currency_code) values (${usdAssetId}, ${accountBId}, ${`TEST_USD_ASSET_${runId}`}, 'ASSET', 'DEBIT', 'MONEY', 'USD'), (${usdEquityId}, ${accountBId}, ${`TEST_USD_EQUITY_${runId}`}, 'EQUITY', 'CREDIT', 'MONEY', 'USD')`;
      await transaction`insert into public.idempotency_records (id, financial_account_id, command_type, idempotency_key, request_hash, result_json) values (${idempotencyId}, ${accountBId}, 'CREATE_VIRTUAL_DEPOSIT', ${unbalancedKey}, ${"b".repeat(64)}, '{}'::jsonb)`;
      await transaction`insert into public.ledger_transactions (id, financial_account_id, idempotency_record_id, transaction_type, occurred_at, narrative) values (${transactionId}, ${accountBId}, ${idempotencyId}, 'VIRTUAL_DEPOSIT', now(), 'M1B.5 commodity validation')`;
      await transaction`insert into public.ledger_entries (ledger_transaction_id, ledger_account_id, direction, amount_atoms) values (${transactionId}, ${cashId}, 'DEBIT', 100), (${transactionId}, ${contributedCapitalId}, 'CREDIT', 99), (${transactionId}, ${usdAssetId}, 'DEBIT', 99), (${transactionId}, ${usdEquityId}, 'CREDIT', 100)`;
    })).rejects.toThrow("not balanced per commodity");
    const rollbackCheck = await sql<{ idempotency: string; entries: string; accounts: string }[]>`
      select
        (select count(*)::text from public.idempotency_records where financial_account_id = ${accountBId} and idempotency_key = ${unbalancedKey}) as idempotency,
        (select count(*)::text from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id where lt.financial_account_id = ${accountBId} and lt.narrative = 'M1B.5 commodity validation') as entries,
        (select count(*)::text from public.ledger_accounts where financial_account_id = ${accountBId} and code = ${`TEST_USD_ASSET_${runId}`}) as accounts
    `;
    expect(rollbackCheck[0]).toEqual({ idempotency: "0", entries: "0", accounts: "0" });
  });

  it("prevents historical ledger and audit mutation", async () => {
    await expect(sql`update public.ledger_transactions set narrative = 'mutated' where id = ${firstDepositTransactionId}`).rejects.toThrow("append-only");
    await expect(sql`delete from public.ledger_entries where ledger_transaction_id = ${firstDepositTransactionId}`).rejects.toThrow("append-only");
    await expect(sql`update public.audit_events set outcome = 'FAILED' where id = ${firstDepositAuditEventId}`).rejects.toThrow("append-only");
  });

  it("enforces RLS isolation and rejects a cross-account command", async () => {
    await sql.begin(async (transaction) => {
      await transaction`set local role authenticated`;
      await transaction`select set_config('request.jwt.claim.sub', ${ownerB}, true)`;
      const counts = await transaction<{ accounts: string; ledgerAccounts: string; transactions: string; entries: string; audits: string; idempotency: string }[]>`
        select
          (select count(*)::text from public.financial_accounts where id = ${accountAId}) as accounts,
          (select count(*)::text from public.ledger_accounts where financial_account_id = ${accountAId}) as "ledgerAccounts",
          (select count(*)::text from public.ledger_transactions where financial_account_id = ${accountAId}) as transactions,
          (select count(*)::text from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id where lt.financial_account_id = ${accountAId}) as entries,
          (select count(*)::text from public.audit_events where financial_account_id = ${accountAId}) as audits,
          (select count(*)::text from public.idempotency_records where financial_account_id = ${accountAId}) as idempotency
      `;
      expect(counts[0]).toEqual({ accounts: "0", ledgerAccounts: "0", transactions: "0", entries: "0", audits: "0", idempotency: "0" });
    });
    await expect(new CreateVirtualDeposit(repository).execute({ ...commandInput(`m1b5-unauthorized-${runId}`), actorId: ownerB })).rejects.toThrow("not found");
  });
});
