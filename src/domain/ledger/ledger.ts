import type { CurrencyCode } from "@/domain/financial/currency";
import { money, type Money } from "@/domain/financial/money";

export type LedgerAccountClass = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "CLEARING";
export type LedgerDirection = "DEBIT" | "CREDIT";
export type NormalBalance = LedgerDirection;

export type LedgerCommodity =
  | { readonly kind: "MONEY"; readonly currencyCode: CurrencyCode }
  | { readonly kind: "ASSET"; readonly assetId: string };

export interface LedgerAccount {
  readonly id: string;
  readonly financialAccountId: string;
  readonly code: string;
  readonly accountClass: LedgerAccountClass;
  readonly normalBalance: NormalBalance;
  readonly commodity: LedgerCommodity;
}

export interface LedgerEntry {
  readonly ledgerAccount: LedgerAccount;
  readonly direction: LedgerDirection;
  readonly amountAtoms: bigint;
}

export interface LedgerTransaction {
  readonly id: string;
  readonly financialAccountId: string;
  readonly idempotencyRecordId?: string;
  readonly type: "VIRTUAL_DEPOSIT" | "SIMULATED_BUY_SETTLEMENT" | "REVERSAL";
  readonly occurredAt: Date;
  readonly narrative: string;
  readonly reversalOfTransactionId?: string;
  readonly entries: readonly LedgerEntry[];
}

export function ledgerEntry(ledgerAccount: LedgerAccount, direction: LedgerDirection, amountAtoms: bigint): LedgerEntry {
  if (amountAtoms <= 0n) throw new Error("Ledger entry amount must be positive");
  return Object.freeze({ ledgerAccount, direction, amountAtoms });
}

function commodityKey(commodity: LedgerCommodity): string {
  return commodity.kind === "MONEY" ? `MONEY:${commodity.currencyCode}` : `ASSET:${commodity.assetId}`;
}

function signedAmount(entry: LedgerEntry): bigint {
  return entry.direction === "DEBIT" ? entry.amountAtoms : -entry.amountAtoms;
}

export function assertBalancedEntries(financialAccountId: string, entries: readonly LedgerEntry[]): void {
  if (entries.length < 2) throw new Error("A ledger transaction requires at least two entries");
  const balances = new Map<string, bigint>();

  for (const entry of entries) {
    if (entry.ledgerAccount.financialAccountId !== financialAccountId) {
      throw new Error("Ledger entries must belong to the transaction FinancialAccount");
    }
    const key = commodityKey(entry.ledgerAccount.commodity);
    balances.set(key, (balances.get(key) ?? 0n) + signedAmount(entry));
  }

  for (const [commodity, balance] of balances) {
    if (balance !== 0n) throw new Error(`Ledger transaction is unbalanced for ${commodity}`);
  }
}

export function createLedgerTransaction(input: Omit<LedgerTransaction, "entries"> & { entries: readonly LedgerEntry[] }): LedgerTransaction {
  assertBalancedEntries(input.financialAccountId, input.entries);
  return Object.freeze({ ...input, occurredAt: new Date(input.occurredAt), entries: Object.freeze([...input.entries]) });
}

export function createVirtualDepositTransaction(input: {
  readonly id: string;
  readonly financialAccountId: string;
  readonly occurredAt: Date;
  readonly amount: Money;
  readonly idempotencyRecordId: string;
  readonly cashAccount: LedgerAccount;
  readonly contributedCapitalAccount: LedgerAccount;
}): LedgerTransaction {
  const { cashAccount, contributedCapitalAccount, amount } = input;
  if (cashAccount.code !== "CASH" || contributedCapitalAccount.code !== "VIRTUAL_CONTRIBUTED_CAPITAL") {
    throw new Error("Virtual deposits require CASH and VIRTUAL_CONTRIBUTED_CAPITAL ledger accounts");
  }
  if (cashAccount.commodity.kind !== "MONEY" || contributedCapitalAccount.commodity.kind !== "MONEY") {
    throw new Error("Virtual deposit accounts must use money commodities");
  }
  if (cashAccount.commodity.currencyCode !== amount.currencyCode || contributedCapitalAccount.commodity.currencyCode !== amount.currencyCode) {
    throw new Error("Virtual deposit ledger account currency mismatch");
  }

  return createLedgerTransaction({
    id: input.id,
    financialAccountId: input.financialAccountId,
    idempotencyRecordId: input.idempotencyRecordId,
    type: "VIRTUAL_DEPOSIT",
    occurredAt: input.occurredAt,
    narrative: "Virtual capital deposit",
    entries: [
      ledgerEntry(cashAccount, "DEBIT", amount.minorUnits),
      ledgerEntry(contributedCapitalAccount, "CREDIT", amount.minorUnits),
    ],
  });
}

export function createReversalTransaction(input: { readonly id: string; readonly original: LedgerTransaction; readonly occurredAt: Date }): LedgerTransaction {
  return createLedgerTransaction({
    id: input.id,
    financialAccountId: input.original.financialAccountId,
    type: "REVERSAL",
    occurredAt: input.occurredAt,
    narrative: `Reversal of ${input.original.id}`,
    reversalOfTransactionId: input.original.id,
    entries: input.original.entries.map((entry) => ledgerEntry(entry.ledgerAccount, entry.direction === "DEBIT" ? "CREDIT" : "DEBIT", entry.amountAtoms)),
  });
}

export function calculateAccountBalance(entries: readonly LedgerEntry[], ledgerAccount: LedgerAccount): bigint {
  return entries.reduce((balance, entry) => {
    if (entry.ledgerAccount.id !== ledgerAccount.id) return balance;
    return balance + (entry.direction === ledgerAccount.normalBalance ? entry.amountAtoms : -entry.amountAtoms);
  }, 0n);
}

export function calculateCashBalance(entries: readonly LedgerEntry[], cashAccount: LedgerAccount): Money {
  if (cashAccount.commodity.kind !== "MONEY") throw new Error("Cash account must have a money commodity");
  return money(cashAccount.commodity.currencyCode, calculateAccountBalance(entries, cashAccount));
}
