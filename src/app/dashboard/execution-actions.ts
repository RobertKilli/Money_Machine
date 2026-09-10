"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ExecuteApprovedSimulationDecision } from "@/application/execution/execute-approved-simulation-decision";
import { M1DExecutionRepository } from "@/infrastructure/postgres/m1d-execution-repository";

export async function executeApprovedSimulationDecisionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const proposalId = String(formData.get("proposalId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? randomUUID());
  const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error("Database is not configured");
  const repository = new M1DExecutionRepository(databaseUrl);
  try { await new ExecuteApprovedSimulationDecision(repository).execute({ actorId: user.id, proposalId, idempotencyKey }); }
  finally { await repository.close(); }
  redirect("/dashboard");
}
