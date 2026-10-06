import { notFound } from "next/navigation";
import { OfflineSnapshotRoundtripView } from "@/components/intelligence/offline-snapshot-roundtrip-view";

export const metadata = {
  title: "Syntetisk snapshot roundtrip | Evidence review queue",
  description: "Lokal, read-only snapshot-codec og scope-binding demonstrasjon.",
};

export default async function OfflineSnapshotRoundtripPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { loadEventIntelligenceOfflineSnapshotRoundtrip } = await import("@/application/intelligence/load-event-intelligence-offline-snapshot-roundtrip");
  return <OfflineSnapshotRoundtripView result={await loadEventIntelligenceOfflineSnapshotRoundtrip()} />;
}
