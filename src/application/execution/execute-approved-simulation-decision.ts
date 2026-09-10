import { M1DExecutionRepository, type ExecutionResult } from "@/infrastructure/postgres/m1d-execution-repository";

export interface ExecuteApprovedSimulationDecisionInput { readonly actorId: string; readonly proposalId: string; readonly idempotencyKey: string; }

export class ExecuteApprovedSimulationDecision {
  constructor(private readonly repository: Pick<M1DExecutionRepository, "executeApprovedProposal">) {}
  execute(input: ExecuteApprovedSimulationDecisionInput): Promise<ExecutionResult> {
    if (!input.actorId || !input.proposalId || !input.idempotencyKey.trim()) throw new Error("Execution command is invalid");
    return this.repository.executeApprovedProposal(input.actorId, input.proposalId, input.idempotencyKey);
  }
}
