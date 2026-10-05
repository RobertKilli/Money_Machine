import { notFound } from "next/navigation";
import { OfflineReviewSessionDemoView } from "@/components/intelligence/offline-review-session-demo-view";

export const metadata = {
  title: "Offline review session | Evidence review queue",
  description: "Read-only syntetisk demonstrasjon av avgrensede review-sessioner i minnet.",
};

export default async function OfflineReviewSessionPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { loadOfflineReviewSessionDemo } = await import("@/application/intelligence/load-offline-review-session-demo");
  return <OfflineReviewSessionDemoView result={await loadOfflineReviewSessionDemo()} />;
}
