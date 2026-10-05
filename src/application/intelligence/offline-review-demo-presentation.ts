import "server-only";

import { getComposedCandidatePublicKey } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import type { EvidenceReviewQueueViewModel, EvidenceReviewQueueViewModelItem } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import type { OfflineReviewDemoFixture } from "@/application/intelligence/offline-review-demo-fixtures";

export type OfflineReviewDemoDetail = Readonly<{
  key: OfflineReviewDemoFixture["key"];
  label: string;
  description: string;
  reviewGuidance: OfflineReviewDemoFixture["reviewGuidance"];
  sourceMaterial: OfflineReviewDemoFixture["sourceMaterial"];
  item: EvidenceReviewQueueViewModelItem;
  detailId: string;
}>;

const detailIdFor = (key: OfflineReviewDemoFixture["key"]): string => `offline-review-demo-detail-${key}`;

/** Bind each fixed demo fixture to its unique projected review type, never to queue order or title. */
export function bindOfflineReviewDemoDetails(
  fixtures: readonly OfflineReviewDemoFixture[],
  model: EvidenceReviewQueueViewModel,
): readonly OfflineReviewDemoDetail[] | null {
  if (model.state !== "HAS_REVIEW_ITEMS" || fixtures.length !== model.items.length) return null;

  const fixtureTypes = new Set<string>();
  const fixtureKeys = new Set<string>();
  const publicKeys = new Set<string>();
  const detailIds = new Set<string>();
  const details: OfflineReviewDemoDetail[] = [];

  for (const fixture of fixtures) {
    const detailId = detailIdFor(fixture.key);
    if (fixtureTypes.has(fixture.expectedReviewType) || fixtureKeys.has(fixture.key) || detailIds.has(detailId)) return null;
    fixtureTypes.add(fixture.expectedReviewType);
    fixtureKeys.add(fixture.key);
    detailIds.add(detailId);

    const expectedPublicKey = getComposedCandidatePublicKey(model, fixture.candidate.candidateId);
    if (!expectedPublicKey) return null;
    const matches = model.items.filter(item => item.publicKey === expectedPublicKey && item.reviewType === fixture.expectedReviewType);
    if (matches.length !== 1) return null;
    const item = matches[0]!;
    if (publicKeys.has(item.publicKey)) return null;
    publicKeys.add(item.publicKey);

    details.push(Object.freeze({
      key: fixture.key,
      label: fixture.label,
      description: fixture.description,
      reviewGuidance: fixture.reviewGuidance,
      sourceMaterial: fixture.sourceMaterial,
      item,
      detailId,
    }));
  }

  if (fixtureTypes.size !== model.items.length || publicKeys.size !== model.items.length || detailIds.size !== model.items.length) return null;
  return Object.freeze(details);
}
