"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { EvaluateContributionRebalancing } from "@/application/decisions/evaluate-contribution-rebalancing";
import { getPostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";
import { M1CDecisionRepository } from "@/infrastructure/postgres/m1c-decision-repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function evaluateContributionDecision(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const financialAccountId = formData.get("financialAccountId");
  if (!user || typeof financialAccountId !== "string") redirect("/login");
  const accounts = getPostgresFinancialRepository();
  const connectionString = process.env.DATABASE_URL;
  if (!accounts || !connectionString) redirect("/dashboard?decision=unavailable");
  const decisions = new M1CDecisionRepository(connectionString);
  try {
    const result = await new EvaluateContributionRebalancing(accounts, decisions).execute({ actorId: user.id, financialAccountId, idempotencyKey: randomUUID() });
    revalidatePath("/dashboard");
    redirect(`/dashboard?decision=${result.status}`);
  } catch (error) {
    console.error("Contribution decision failed", error);
    redirect("/dashboard?decision=error");
  } finally {
    await decisions.close();
  }
}
