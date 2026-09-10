import "server-only";

import type { CreateVirtualDepositInput, CreateVirtualDepositResult, FinancialRepository } from "@/application/deposits/contracts";
import { CreateVirtualDeposit } from "@/application/deposits/create-virtual-deposit";
import { getCurrentUser } from "@/lib/auth/current-user";

export type AuthenticatedDepositRequest = Omit<CreateVirtualDepositInput, "actorId">;

/**
 * Server boundary for a future route handler/server action. The browser supplies
 * no actor ID; identity is resolved from the verified Supabase session here.
 */
export async function createVirtualDepositForCurrentUser(
  repository: FinancialRepository,
  request: AuthenticatedDepositRequest,
): Promise<CreateVirtualDepositResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication is required");

  return new CreateVirtualDeposit(repository).execute({ ...request, actorId: user.id });
}
