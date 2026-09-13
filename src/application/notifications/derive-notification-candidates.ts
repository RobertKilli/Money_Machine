import "server-only";
import type { AlertCandidate } from "@/domain/notifications/alerts";
import { evaluatePnlAlert } from "@/domain/notifications/alerts";
import { GetPortfolioProjection } from "@/application/portfolio/get-portfolio-projection";
import { getPortfolioReadRepository } from "@/infrastructure/postgres/portfolio-read-repository";
import { getNotificationPreferences } from "@/infrastructure/postgres/notification-repository";
import { deriveHighInterestCandidates, type CanonicalHighInterestEvidence } from "@/domain/notifications/high-interest-source";
import { readCanonicalHighInterestEvidence } from "@/infrastructure/postgres/canonical-intelligence-repository";

export type HighInterestEvidenceReader = (adminUserId: string, asOf: Date) => Promise<readonly CanonicalHighInterestEvidence[]>;

/**
 * Production candidate boundary. Source adapters are intentionally read-only;
 * when no eligible source evidence exists this returns an empty set rather
 * than fabricating an alert.
 */
export async function deriveAdminNotificationCandidates(input: { adminUserId: string; asOf: Date; readHighInterestEvidence?: HighInterestEvidenceReader }): Promise<readonly AlertCandidate[]> {
  if (!Number.isFinite(input.asOf.getTime())) throw new Error("INVALID_AS_OF");
  const [preferences, repository] = await Promise.all([getNotificationPreferences(input.adminUserId), Promise.resolve(getPortfolioReadRepository())]);
  const highInterest = input.readHighInterestEvidence ? deriveHighInterestCandidates(await input.readHighInterestEvidence(input.adminUserId, input.asOf), input.asOf) : [];
  if (!preferences || !repository) return Object.freeze(highInterest);
  const projection = await new GetPortfolioProjection(repository).execute({ actorId: input.adminUserId, asOf: input.asOf });
  if (!projection || projection.valuationStatus !== "COMPLETE" || projection.unrealizedPnl === null) return Object.freeze(highInterest);
  const candidate = evaluatePnlAlert({ accountId: projection.financialAccountId, asOf: input.asOf, pnlMinor: BigInt(projection.unrealizedPnl), currency: projection.baseCurrency, thresholdMinor: preferences.pnlMilestoneThresholdMinor });
  return Object.freeze(candidate ? [candidate, ...highInterest] : highInterest);
}

export const deriveNotificationCandidatesAt = async (adminUserId: string, asOf: Date) => deriveAdminNotificationCandidates({ adminUserId, asOf, readHighInterestEvidence: readCanonicalHighInterestEvidence });
