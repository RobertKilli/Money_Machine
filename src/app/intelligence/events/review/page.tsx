import type { Metadata } from "next";
import { loadEvidenceReviewQueueViewModel } from "@/application/intelligence/load-evidence-review-queue-view-model";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";

export const metadata: Metadata = {
  title: "Evidence review queue | Event Intelligence",
  description: "Read-only review of non-authoritative event evidence candidates.",
};

export default function EvidenceReviewQueuePage() {
  const model = loadEvidenceReviewQueueViewModel();
  return <EvidenceReviewQueueWorkspace model={model} />;
}
