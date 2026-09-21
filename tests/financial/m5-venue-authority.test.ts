import { describe, expect, it } from "vitest";
import { createM5VenueAuthority, type VenueAuthoritySourceMaterial } from "@/domain/intelligence/m5-venue-authority";

const t = "2026-01-01T00:00:00.000Z";
const a = "2026-01-01T00:01:00.000Z";
const asOf = "2026-01-01T00:02:00.000Z";
const material = (record: string, venue: string, page: number, ordinal: number, finalPage: boolean): VenueAuthoritySourceMaterial => ({ sourceArtifactId: `artifact-${record}`, sourceEnvelopeId: `envelope-${record}`, sourceObservationId: `observation-${record}`, providerExternalRecordId: record, payloadFingerprint: `${"a".repeat(63)}${ordinal}`, venueNamespace: "EXCHANGE", venueId: venue, venueType: "CEX", pageOrdinal: page, recordOrdinal: ordinal, finalPage, expectedPageCount: 2, expectedRecordCount: 3, coverageKind: "PAGINATED_COMPLETE_UNIVERSE", coverageVersion: "venue-pages/v1", observedAt: t, availableAt: a });

describe("M5 venue-universe authority", () => {
  it("deduplicates pools/pairs on the same venue and is permutation invariant", () => {
    const materials = [material("pool-a", "venue-a", 0, 0, false), material("pair-a", "venue-a", 0, 1, false), material("pool-b", "venue-b", 1, 2, true)];
    const first = createM5VenueAuthority({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceLineageId: "lineage", asOf, universeNamespace: "COINGECKO", universeId: "asset-1", expectedPageCount: 2, expectedRecordCount: 3, materials, recordedAt: asOf });
    const second = createM5VenueAuthority({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceLineageId: "lineage", asOf, universeNamespace: "COINGECKO", universeId: "asset-1", expectedPageCount: 2, expectedRecordCount: 3, materials: [...materials].reverse(), recordedAt: "2026-01-01T00:03:00.000Z" });
    expect(first.status).toBe("READY"); expect(second.status).toBe("READY");
    if (first.status === "READY" && second.status === "READY") { expect(first.authority.members).toHaveLength(2); expect(first.authority.fingerprint).toBe(second.authority.fingerprint); expect(first.authority.authorityId).toBe(second.authority.authorityId); expect(first.authority.members.every(Object.isFrozen)).toBe(true); }
  });
  it("fails closed for top-pool-only and missing final page", () => {
    expect(createM5VenueAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, universeNamespace: "N", universeId: "u", expectedPageCount: 2, expectedRecordCount: 3, materials: [material("pool-a", "venue-a", 0, 0, false)], recordedAt: asOf }).status).toBe("INCOMPLETE");
    expect(createM5VenueAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, universeNamespace: "N", universeId: "u", expectedPageCount: 2, expectedRecordCount: 3, materials: [material("pool-a", "venue-a", 0, 0, false), material("pool-b", "venue-b", 1, 1, false), material("pool-c", "venue-c", 1, 2, false)], recordedAt: asOf }).status).toBe("INCOMPLETE");
  });
  it("rejects duplicate records and invalid venue identity material", () => {
    const duplicate = material("pool-a", "venue-a", 0, 0, false);
    expect(createM5VenueAuthority({ providerId: "p", datasetId: "d", datasetVersion: "v", sourceLineageId: "l", asOf, universeNamespace: "N", universeId: "u", expectedPageCount: 2, expectedRecordCount: 3, materials: [duplicate, duplicate, material("pool-c", "venue-c", 1, 2, true)], recordedAt: asOf }).status).toBe("INVALID");
  });
});
