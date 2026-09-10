import { describe, expect, it } from "vitest";

import { CreateVirtualDeposit } from "@/application/deposits/create-virtual-deposit";
import { money } from "@/domain/financial/money";
import { OTHER_OWNER_ID, TEST_FINANCIAL_ACCOUNT_ID, TEST_OWNER_ID, testRepository } from "../helpers/financial-fixtures";

function depositInput(overrides: Partial<Parameters<CreateVirtualDeposit["execute"]>[0]> = {}) {
  return {
    actorId: TEST_OWNER_ID,
    financialAccountId: TEST_FINANCIAL_ACCOUNT_ID,
    amount: money("NOK", 100_000n),
    idempotencyKey: "deposit-001",
    occurredAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("CreateVirtualDeposit", () => {
  it("posts one balanced simulated deposit, audit event, and cash projection", async () => {
    const repository = testRepository();
    const result = await new CreateVirtualDeposit(repository).execute(depositInput());
    expect(result.availableCash.minorUnits).toBe(100_000n);
    expect(repository.ledgerTransactions()).toHaveLength(1);
    expect(repository.auditEvents()).toHaveLength(1);
    expect(repository.auditEvents()[0]?.ledgerTransactionId).toBe(result.ledgerTransactionId);
  });

  it("rejects zero, negative, wrong-currency, and unauthorized deposits without success audit evidence", async () => {
    const repository = testRepository();
    const command = new CreateVirtualDeposit(repository);
    await expect(command.execute(depositInput({ amount: money("NOK", 0n) }))).rejects.toThrow("positive");
    await expect(command.execute(depositInput({ amount: money("NOK", -1n) }))).rejects.toThrow("positive");
    await expect(command.execute(depositInput({ amount: money("USD", 100n) }))).rejects.toThrow("currency");
    await expect(command.execute(depositInput({ actorId: OTHER_OWNER_ID }))).rejects.toThrow("not found");
    expect(repository.ledgerTransactions()).toHaveLength(0);
    expect(repository.auditEvents()).toHaveLength(0);
  });

  it("returns the original result for duplicate and concurrent retries without a duplicate journal", async () => {
    const repository = testRepository();
    const command = new CreateVirtualDeposit(repository);
    const input = depositInput();
    const [first, second] = await Promise.all([command.execute(input), command.execute(input)]);
    expect(second).toEqual(first);
    expect(repository.ledgerTransactions()).toHaveLength(1);
    expect(repository.auditEvents()).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with different input", async () => {
    const repository = testRepository();
    const command = new CreateVirtualDeposit(repository);
    await command.execute(depositInput());
    await expect(command.execute(depositInput({ amount: money("NOK", 100_001n) }))).rejects.toThrow("different input");
    expect(repository.ledgerTransactions()).toHaveLength(1);
  });
});
