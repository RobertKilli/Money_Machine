import "server-only";

import {
  createBlockedEvidenceReviewQueueViewModel,
  isSerializableEvidenceReviewQueueViewModel,
  type EvidenceReviewQueueViewModel,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

/** Production remains empty until a separately reviewed read-model exists. */
export function loadEvidenceReviewQueueViewModel(): EvidenceReviewQueueViewModel {
  try {
    const model = createBlockedEvidenceReviewQueueViewModel();
    return isSerializableEvidenceReviewQueueViewModel(model)
      ? model
      : createBlockedEvidenceReviewQueueViewModel();
  } catch {
    // Never pass an exception, provider payload, or internal identifier to the page.
    return createBlockedEvidenceReviewQueueViewModel();
  }
}
