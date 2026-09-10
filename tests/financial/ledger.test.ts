import { describe, expect, it } from "vitest";

import { money } from "@/domain/financial/money";
import { calculateCashBalance, createLedgerTransaction, createReversalTransaction, createVirtualDepositTransaction, ledgerEntry } from "@/domain/ledger/ledger";
import { testLedgerAccounts, TEST_FINANCIAL_ACCOUNT_ID } from "../helpers/financial-fixtures";

describe("double-entry ledger", () => {
  it("accepts a balanced virtual deposit and derives cash", () => {
    const [cash, capital] = testLedgerAccounts();
    const transaction = createVirtualDepositTransaction({
      id: "deposit-1",
      financialAccountId: TEST_FINANCIAL_ACCOUNT_ID,
      idempotencyRecordId: "command-1",
      occurredAt: new Date("2025-01-01T00:00:00.000Z"),
      amount: money("NOK", 100_000n),
      cashAccount: cash,
      contributedCapitalAccount: capital,
    });
    expect(calculateCashBalance(transaction.entries, cash).minorUnits).toBe(100_000n);
  });

  it("rejects unbalanced and cross-commodity journals", () => {
    const [cash] = testLedgerAccounts();
    expect(() => createLedgerTransaction({
      id: "bad-1", financialAccountId: TEST_FINANCIAL_ACCOUNT_ID, type: "VIRTUAL_DEPOSIT", occurredAt: new Date(), narrative: "bad", entries: [ledgerEntry(cash, "DEBIT", 1n)],
    })).toThrow("at least two");

    const usdCapital = { ...testLedgerAccounts()[1], id: "usd-capital", commodity: { kind: "MONEY" as const, currencyCode: "USD" as const } };
    expect(() => createLedgerTransaction({
      id: "bad-2", financialAccountId: TEST_FINANCIAL_ACCOUNT_ID, type: "VIRTUAL_DEPOSIT", occurredAt: new Date(), narrative: "bad", entries: [ledgerEntry(cash, "DEBIT", 10n), ledgerEntry(usdCapital, "CREDIT", 10n)],
    })).toThrow("unbalanced");
  });

  it("accepts multiple balanced entries and deterministic reversal replay", () => {
    const [cash, capital] = testLedgerAccounts();
    const expense = { ...cash, id: "expense", code: "FEE_EXPENSE", accountClass: "EXPENSE" as const };
    const transaction = createLedgerTransaction({
      id: "multi", financialAccountId: TEST_FINANCIAL_ACCOUNT_ID, type: "VIRTUAL_DEPOSIT", occurredAt: new Date(), narrative: "multi",
      entries: [ledgerEntry(cash, "DEBIT", 100n), ledgerEntry(expense, "DEBIT", 20n), ledgerEntry(capital, "CREDIT", 120n)],
    });
    const reversal = createReversalTransaction({ id: "reversal", original: transaction, occurredAt: new Date() });
    expect(calculateCashBalance([...transaction.entries, ...reversal.entries], cash).minorUnits).toBe(0n);
  });
});
