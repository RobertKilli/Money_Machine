"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { CreateVirtualDeposit } from "@/application/deposits/create-virtual-deposit";
import { formatMoney, moneyFromDecimalInput } from "@/domain/financial/money";
import { getPostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";
import { getCurrentUser } from "@/lib/auth/current-user";

/** Explicit provisioning command; portfolio GET requests never create accounts. */
export async function initializeSimulationAccount(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  const repository = getPostgresFinancialRepository();
  if (!repository) throw new Error("Simulation unavailable");
  await repository.getOrCreateDefaultSimulationAccount(user.id);
  revalidatePath("/dashboard");
}

export interface DepositActionState {
  readonly status: "idle" | "success" | "error";
  readonly idempotencyKey: string;
  readonly message?: string;
}

function safeDepositError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("decimal string") || message.includes("scale") || message.includes("positive")) return "Enter a positive NOK amount with at most two decimal places.";
  if (message.includes("Idempotency key was already used")) return "This deposit request conflicts with an earlier request. Please start a new deposit.";
  if (message.includes("FinancialAccount was not found") || message.includes("not active")) return "This simulation account is not available.";
  if (message.includes("currency")) return "The deposit currency does not match this simulation account.";
  return "We could not record the virtual deposit. No virtual money was added.";
}

/** The browser provides only untrusted form text and a command key. */
export async function submitVirtualDeposit(previous: DepositActionState, formData: FormData): Promise<DepositActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", idempotencyKey: previous.idempotencyKey, message: "Sign in is required to add virtual money." };
  const financialAccountId = formData.get("financialAccountId");
  const amountText = formData.get("amount");
  const idempotencyKey = formData.get("idempotencyKey");
  if (typeof financialAccountId !== "string" || typeof amountText !== "string" || typeof idempotencyKey !== "string") {
    return { status: "error", idempotencyKey: previous.idempotencyKey, message: "The deposit request is incomplete." };
  }

  const repository = getPostgresFinancialRepository();
  if (!repository) return { status: "error", idempotencyKey, message: "Simulator persistence is not configured for this environment." };

  try {
    // Actor, ownership, and base currency are resolved server-side; the browser
    // never supplies trusted ledger, currency, or audit values.
    const overview = await repository.getFinancialAccountOverview(financialAccountId, user.id);
    if (!overview) return { status: "error", idempotencyKey, message: "This simulation account is not available." };
    const result = await new CreateVirtualDeposit(repository).execute({
      actorId: user.id,
      financialAccountId: overview.account.id,
      amount: moneyFromDecimalInput(overview.account.baseCurrencyCode, amountText),
      idempotencyKey,
    });
    revalidatePath("/dashboard");
    return { status: "success", idempotencyKey: randomUUID(), message: `Virtual deposit recorded: ${formatMoney(result.depositedAmount)}.` };
  } catch (error) {
    // Detailed SQL errors stay in server logs; the browser receives a safe error.
    console.error("Virtual deposit command failed", error);
    return { status: "error", idempotencyKey, message: safeDepositError(error) };
  }
}
