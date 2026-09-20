import { describe, expect, it, vi } from "vitest";
import { createM5HolderSnapshot } from "@/domain/intelligence/m5-holder-concentration";
import { persistM5HolderSnapshotFromSourceLineage } from "@/application/intelligence/m5-holder-snapshot-persistence";

const snapshot = () => createM5HolderSnapshot({
  providerId: "fixture-provider", datasetId: "fixture-holders", datasetVersion: "v1", sourceLineageId: "UNBOUND_FIXTURE", sourceLineageBinding: "UNBOUND_FIXTURE", chainId: "eip155:1", contractAddress: `0x${"1".repeat(40)}`, blockNumber: 100n, blockHash: `0x${"a".repeat(64)}`, blockTimestamp: "2026-01-01T00:00:00.000Z", finalityStatus: "CONFIRMED", finalityDepth: 12, tokenDecimals: 18, supplyBasis: "TOTAL_SUPPLY", addressPolicy: "INCLUDE_ALL", denominatorAtoms: 100n, declaredHolderCount: 1, fullPaginationProof: { pageCount: 1, finalPageOrdinal: 0, pages: [{ pageOrdinal: 0, itemCount: 1, isFinal: true, blockNumber: 100n, blockHash: `0x${"a".repeat(64)}`, tokenDecimals: 18, sourceRecordIds: ["page-0"], payloadFingerprint: "a".repeat(64) }] }, holders: [{ address: `0x${"2".repeat(40)}`, balanceAtoms: 100n, inclusionState: "INCLUDED", sourceRecordId: "page-0", sourcePageOrdinal: 0, sourceItemOrdinal: 0, ordinal: 0 }], materialSourceRecordIds: ["page-0"], payloadFingerprints: ["a".repeat(64)], observedAt: "2026-01-01T00:00:00.000Z", availableAt: "2026-01-01T00:01:00.000Z", recordedAt: "2026-01-01T00:02:00.000Z" });

describe("M5 holder snapshot persistence application boundary", () => {
  it("does not open a snapshot write path when the sealed lineage is missing", async () => {
    const save = vi.fn();
    const result = await persistM5HolderSnapshotFromSourceLineage({
      snapshot: snapshot(), sourceLineageId: "lineage-missing", asOf: "2026-01-01T00:02:00.000Z", recordedAt: "2026-01-01T00:02:00.000Z",
      unitOfWork: { withTransaction: async work => work({ sourceLineage: { readById: async () => undefined, readMembers: async () => [], snapshots: undefined } as never, snapshots: { save, readById: async () => undefined } }) },
    });
    expect(result).toEqual({ status: "INCOMPLETE", diagnostics: ["M5_HOLDER_PERSISTENCE_LINEAGE_MISSING"] });
    expect(save).not.toHaveBeenCalled();
  });
});
