import type { CurrencyCode } from "@/domain/financial/currency";
import type { Money } from "@/domain/financial/money";
import type { LedgerAccount, LedgerEntry, LedgerTransaction } from "@/domain/ledger/ledger";

export type FinancialAccountMode = "SIMULATION" | "PAPER";

export interface FinancialAccount {
  readonly id: string;
  readonly ownerId: string;
  readonly baseCurrencyCode: CurrencyCode;
  readonly mode: FinancialAccountMode;
  readonly status: "ACTIVE" | "CLOSED";
}

export interface IdempotencyRecord<T> {
  readonly id: string;
  readonly financialAccountId: string;
  readonly commandType: "CREATE_VIRTUAL_DEPOSIT";
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly result: T;
}

export interface AuditEvent {
  readonly id: string;
  readonly financialAccountId: string;
  readonly actorId: string;
  readonly commandId: string;
  readonly commandType: "CREATE_VIRTUAL_DEPOSIT";
  readonly idempotencyKey: string;
  readonly outcome: "SUCCEEDED";
  readonly occurredAt: Date;
  readonly policyVersions: Readonly<Record<string, string>>;
  readonly ledgerTransactionId: string;
}

export interface FinancialTransactionStore {
  /**
   * Production stores are asynchronous because each method runs inside one
   * PostgreSQL transaction. The financial domain remains independent of SQL.
   */
  getFinancialAccount(id: string): Promise<FinancialAccount | undefined>;
  getIdempotencyRecord<T>(financialAccountId: string, commandType: "CREATE_VIRTUAL_DEPOSIT", idempotencyKey: string): Promise<IdempotencyRecord<T> | undefined>;
  getLedgerAccount(financialAccountId: string, code: string): Promise<LedgerAccount | undefined>;
  listLedgerEntries(financialAccountId: string): Promise<readonly LedgerEntry[]>;
  insertIdempotencyRecord<T>(record: IdempotencyRecord<T>): Promise<void>;
  insertLedgerTransaction(transaction: LedgerTransaction): Promise<void>;
  insertAuditEvent(event: AuditEvent): Promise<void>;
}

export interface FinancialRepository {
  transaction<T>(operation: (store: FinancialTransactionStore) => Promise<T> | T): Promise<T>;
}

export interface CreateVirtualDepositInput {
  readonly actorId: string;
  readonly financialAccountId: string;
  readonly amount: Money;
  readonly idempotencyKey: string;
  readonly occurredAt?: Date;
}

export interface CreateVirtualDepositResult {
  readonly commandId: string;
  readonly ledgerTransactionId: string;
  readonly financialAccountId: string;
  readonly depositedAmount: Money;
  readonly availableCash: Money;
}
