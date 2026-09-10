import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { FINANCIAL_POLICY_VERSIONS } from "@/domain/financial/policies";
import { assertPositiveMoney } from "@/domain/financial/money";
import { calculateCashBalance, createVirtualDepositTransaction } from "@/domain/ledger/ledger";

import type { AuditEvent, CreateVirtualDepositInput, CreateVirtualDepositResult, FinancialRepository, IdempotencyRecord } from "./contracts";

const COMMAND_TYPE = "CREATE_VIRTUAL_DEPOSIT" as const;

function requestHash(input: CreateVirtualDepositInput): string {
  const canonicalInput = [COMMAND_TYPE, input.actorId, input.financialAccountId, input.amount.currencyCode, input.amount.minorUnits.toString(), input.idempotencyKey].join("|");
  return createHash("sha256").update(canonicalInput).digest("hex");
}

export class CreateVirtualDeposit {
  constructor(private readonly repository: FinancialRepository) {}

  async execute(input: CreateVirtualDepositInput): Promise<CreateVirtualDepositResult> {
    if (!input.idempotencyKey.trim()) throw new Error("An idempotency key is required");
    assertPositiveMoney(input.amount);

    const occurredAt = input.occurredAt ?? new Date();

    return this.repository.transaction(async (store) => {
      const financialAccount = await store.getFinancialAccount(input.financialAccountId);
      if (!financialAccount || financialAccount.ownerId !== input.actorId) throw new Error("FinancialAccount was not found for this user");
      if (financialAccount.status !== "ACTIVE") throw new Error("FinancialAccount is not active");
      if (financialAccount.mode !== "SIMULATION") throw new Error("Virtual deposits require a simulation FinancialAccount");
      if (financialAccount.baseCurrencyCode !== input.amount.currencyCode) throw new Error("Deposit currency must match the FinancialAccount base currency");

      const hash = requestHash(input);
      const existing = await store.getIdempotencyRecord<CreateVirtualDepositResult>(input.financialAccountId, COMMAND_TYPE, input.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== hash) throw new Error("Idempotency key was already used with different input");
        return existing.result;
      }

      const cashAccount = await store.getLedgerAccount(financialAccount.id, "CASH");
      const contributedCapitalAccount = await store.getLedgerAccount(financialAccount.id, "VIRTUAL_CONTRIBUTED_CAPITAL");
      if (!cashAccount || !contributedCapitalAccount) throw new Error("FinancialAccount is missing required ledger accounts");

      const commandId = randomUUID();
      const transaction = createVirtualDepositTransaction({
        id: randomUUID(),
        financialAccountId: financialAccount.id,
        idempotencyRecordId: commandId,
        occurredAt,
        amount: input.amount,
        cashAccount,
        contributedCapitalAccount,
      });

      const availableCash = calculateCashBalance([...(await store.listLedgerEntries(financialAccount.id)), ...transaction.entries], cashAccount);
      const result: CreateVirtualDepositResult = Object.freeze({
        commandId,
        ledgerTransactionId: transaction.id,
        financialAccountId: financialAccount.id,
        depositedAmount: input.amount,
        availableCash,
      });
      const record: IdempotencyRecord<CreateVirtualDepositResult> = Object.freeze({
        id: commandId,
        financialAccountId: financialAccount.id,
        commandType: COMMAND_TYPE,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        result,
      });
      await store.insertIdempotencyRecord(record);
      await store.insertLedgerTransaction(transaction);

      const auditEvent: AuditEvent = Object.freeze({
        id: randomUUID(),
        financialAccountId: financialAccount.id,
        actorId: input.actorId,
        commandId,
        commandType: COMMAND_TYPE,
        idempotencyKey: input.idempotencyKey,
        outcome: "SUCCEEDED",
        occurredAt,
        policyVersions: FINANCIAL_POLICY_VERSIONS,
        ledgerTransactionId: transaction.id,
      });
      await store.insertAuditEvent(auditEvent);
      return result;
    });
  }
}
