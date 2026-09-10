import type {
  AuditEvent,
  FinancialAccount,
  FinancialRepository,
  FinancialTransactionStore,
  IdempotencyRecord,
} from "@/application/deposits/contracts";
import type { LedgerAccount, LedgerEntry, LedgerTransaction } from "@/domain/ledger/ledger";

interface RepositoryState {
  accounts: Map<string, FinancialAccount>;
  ledgerAccounts: Map<string, LedgerAccount>;
  idempotencyRecords: Map<string, IdempotencyRecord<unknown>>;
  ledgerTransactions: Map<string, LedgerTransaction>;
  auditEvents: Map<string, AuditEvent>;
}

export interface InMemoryFinancialRepositorySeed {
  readonly accounts: readonly FinancialAccount[];
  readonly ledgerAccounts: readonly LedgerAccount[];
}

function cloneState(state: RepositoryState): RepositoryState {
  return {
    accounts: new Map(state.accounts),
    ledgerAccounts: new Map(state.ledgerAccounts),
    idempotencyRecords: new Map(state.idempotencyRecords),
    ledgerTransactions: new Map(state.ledgerTransactions),
    auditEvents: new Map(state.auditEvents),
  };
}

function idempotencyMapKey(financialAccountId: string, commandType: string, idempotencyKey: string): string {
  return `${financialAccountId}|${commandType}|${idempotencyKey}`;
}

class InMemoryTransactionStore implements FinancialTransactionStore {
  constructor(private readonly state: RepositoryState) {}

  async getFinancialAccount(id: string): Promise<FinancialAccount | undefined> {
    return this.state.accounts.get(id);
  }

  async getIdempotencyRecord<T>(financialAccountId: string, commandType: "CREATE_VIRTUAL_DEPOSIT", idempotencyKey: string): Promise<IdempotencyRecord<T> | undefined> {
    return this.state.idempotencyRecords.get(idempotencyMapKey(financialAccountId, commandType, idempotencyKey)) as IdempotencyRecord<T> | undefined;
  }

  async getLedgerAccount(financialAccountId: string, code: string): Promise<LedgerAccount | undefined> {
    return [...this.state.ledgerAccounts.values()].find((account) => account.financialAccountId === financialAccountId && account.code === code);
  }

  async listLedgerEntries(financialAccountId: string): Promise<readonly LedgerEntry[]> {
    return [...this.state.ledgerTransactions.values()]
      .filter((transaction) => transaction.financialAccountId === financialAccountId)
      .flatMap((transaction) => transaction.entries);
  }

  async insertIdempotencyRecord<T>(record: IdempotencyRecord<T>): Promise<void> {
    const key = idempotencyMapKey(record.financialAccountId, record.commandType, record.idempotencyKey);
    if (this.state.idempotencyRecords.has(key)) throw new Error("Duplicate idempotency record");
    this.state.idempotencyRecords.set(key, record as IdempotencyRecord<unknown>);
  }

  async insertLedgerTransaction(transaction: LedgerTransaction): Promise<void> {
    if (this.state.ledgerTransactions.has(transaction.id)) throw new Error("Duplicate ledger transaction");
    this.state.ledgerTransactions.set(transaction.id, transaction);
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    if (this.state.auditEvents.has(event.id)) throw new Error("Duplicate audit event");
    this.state.auditEvents.set(event.id, event);
  }
}

/** Test-only adapter. Production mutations must use a database transaction. */
export class InMemoryFinancialRepository implements FinancialRepository {
  private state: RepositoryState;
  private tail: Promise<void> = Promise.resolve();

  constructor(seed: InMemoryFinancialRepositorySeed) {
    this.state = {
      accounts: new Map(seed.accounts.map((account) => [account.id, account])),
      ledgerAccounts: new Map(seed.ledgerAccounts.map((account) => [account.id, account])),
      idempotencyRecords: new Map(),
      ledgerTransactions: new Map(),
      auditEvents: new Map(),
    };
  }

  async transaction<T>(operation: (store: FinancialTransactionStore) => Promise<T> | T): Promise<T> {
    let release: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const draft = cloneState(this.state);
    try {
      const result = await operation(new InMemoryTransactionStore(draft));
      this.state = draft;
      return result;
    } finally {
      release!();
    }
  }

  ledgerTransactions(): readonly LedgerTransaction[] {
    return [...this.state.ledgerTransactions.values()];
  }

  auditEvents(): readonly AuditEvent[] {
    return [...this.state.auditEvents.values()];
  }
}
