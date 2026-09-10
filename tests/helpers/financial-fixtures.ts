import type { FinancialAccount } from "@/application/deposits/contracts";
import type { LedgerAccount } from "@/domain/ledger/ledger";
import { InMemoryFinancialRepository } from "@/infrastructure/testing/in-memory-financial-repository";

export const TEST_OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_OWNER_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_FINANCIAL_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

export function testFinancialAccount(): FinancialAccount {
  return {
    id: TEST_FINANCIAL_ACCOUNT_ID,
    ownerId: TEST_OWNER_ID,
    baseCurrencyCode: "NOK",
    mode: "SIMULATION",
    status: "ACTIVE",
  };
}

export function testLedgerAccounts(): readonly LedgerAccount[] {
  return [
    {
      id: "44444444-4444-4444-8444-444444444444",
      financialAccountId: TEST_FINANCIAL_ACCOUNT_ID,
      code: "CASH",
      accountClass: "ASSET",
      normalBalance: "DEBIT",
      commodity: { kind: "MONEY", currencyCode: "NOK" },
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      financialAccountId: TEST_FINANCIAL_ACCOUNT_ID,
      code: "VIRTUAL_CONTRIBUTED_CAPITAL",
      accountClass: "EQUITY",
      normalBalance: "CREDIT",
      commodity: { kind: "MONEY", currencyCode: "NOK" },
    },
  ];
}

export function testRepository(): InMemoryFinancialRepository {
  return new InMemoryFinancialRepository({ accounts: [testFinancialAccount()], ledgerAccounts: testLedgerAccounts() });
}
