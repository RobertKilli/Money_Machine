import { projectPortfolio, type PortfolioEvidence } from "@/domain/portfolio/portfolio-projection";

export interface PortfolioReadRepository {
  loadOwnedEvidence(actorId: string, accountId: string | undefined, asOf: Date): Promise<PortfolioEvidence | undefined>;
}

/** Actor comes from server authentication, never from browser form fields. */
export class GetPortfolioProjection {
  constructor(private readonly repository: PortfolioReadRepository) {}
  async execute(input: { actorId: string; financialAccountId?: string; asOf: Date }) {
    if (!input.actorId) throw new Error("AUTHENTICATION_REQUIRED");
    if (!Number.isFinite(input.asOf.getTime())) throw new Error("INVALID_AS_OF");
    const evidence = await this.repository.loadOwnedEvidence(input.actorId, input.financialAccountId, input.asOf);
    if (!evidence) return undefined;
    return projectPortfolio(evidence, input.asOf);
  }
}
