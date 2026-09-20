import { describe, expect, it } from "vitest";
import {
  M5_HOLDER_SNAPSHOT_FIXTURE_VERSION,
  createM5HolderSnapshot,
  concentrationBps,
  deriveM5HolderConcentration,
  parseM5HolderSnapshotFixture,
  type M5HolderSnapshot,
} from "@/domain/intelligence/m5-holder-concentration";

const blockHash = `0x${"a".repeat(64)}`;
const observedAt = "2026-02-01T00:00:00.000Z";
const availableAt = "2026-02-01T00:01:00.000Z";
const recordedAt = "2026-02-01T00:02:00.000Z";
const asOf = "2026-02-01T00:03:00.000Z";

function material(overrides: Record<string, unknown> = {}) {
  const balances = [100n, 90n, 80n, 70n, 60n, 50n, 40n, 30n, 20n, 10n, 5n, 1n];
  const pages = [0, 1].map(pageOrdinal => ({
    pageOrdinal,
    itemCount: 6,
    isFinal: pageOrdinal === 1,
    blockNumber: 20_000_000n,
    blockHash,
    tokenDecimals: 18,
    sourceRecordIds: [`holder-page-${pageOrdinal}`],
    payloadFingerprint: `${pageOrdinal ? "b" : "c"}${"0".repeat(63)}`,
  }));
  const holders = balances.map((balanceAtoms, index) => ({
    address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    balanceAtoms,
    inclusionState: "INCLUDED" as const,
    sourceRecordId: `holder-page-${Math.floor(index / 6)}`,
    sourcePageOrdinal: Math.floor(index / 6),
    sourceItemOrdinal: index % 6,
    ordinal: index,
  }));
  return {
    providerId: "synthetic-holder-provider",
    datasetId: "synthetic-holder-snapshot",
    datasetVersion: "synthetic-holder-snapshot/v1",
    sourceLineageId: "UNBOUND_FIXTURE",
    sourceLineageBinding: "UNBOUND_FIXTURE" as const,
    chainId: "eip155:1" as const,
    contractAddress: "0x0000000000000000000000000000000000000001",
    blockNumber: 20_000_000n,
    blockHash,
    blockTimestamp: "2026-01-31T23:00:00.000Z",
    finalityStatus: "FINALIZED" as const,
    finalityDepth: 64,
    tokenDecimals: 18,
    supplyBasis: "TOTAL_SUPPLY" as const,
    addressPolicy: "INCLUDE_ALL" as const,
    denominatorAtoms: balances.reduce((sum, value) => sum + value, 0n),
    declaredHolderCount: holders.length,
    fullPaginationProof: { pageCount: 2, finalPageOrdinal: 1, pages },
    holders,
    materialSourceRecordIds: pages.flatMap(page => page.sourceRecordIds),
    payloadFingerprints: pages.map(page => page.payloadFingerprint),
    observedAt,
    availableAt,
    recordedAt,
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}): M5HolderSnapshot {
  return createM5HolderSnapshot(material(overrides) as Parameters<typeof createM5HolderSnapshot>[0]);
}

function fixture(value: M5HolderSnapshot, overrides: Record<string, unknown> = {}) {
  return {
    fixtureVersion: M5_HOLDER_SNAPSHOT_FIXTURE_VERSION,
    providerId: value.providerId,
    datasetId: value.datasetId,
    datasetVersion: value.datasetVersion,
    sourceLineageId: value.sourceLineageId,
    sourceLineageBinding: value.sourceLineageBinding,
    chainId: value.chainId,
    contractAddress: value.contractAddress,
    blockNumber: value.blockNumber.toString(),
    blockHash: value.blockHash,
    blockTimestamp: value.blockTimestamp,
    finality: { status: value.finalityStatus, depth: value.finalityDepth },
    tokenDecimals: value.tokenDecimals,
    supplyBasis: value.supplyBasis,
    addressPolicy: value.addressPolicy,
    denominatorAtoms: value.denominatorAtoms.toString(),
    declaredHolderCount: value.declaredHolderCount,
    fullPaginationProof: {
      pageCount: value.fullPaginationProof.pageCount,
      finalPageOrdinal: value.fullPaginationProof.finalPageOrdinal,
      pages: value.fullPaginationProof.pages.map(page => ({ ...page, blockNumber: page.blockNumber.toString() })),
    },
    holders: value.holders.map(holder => ({
      address: holder.address,
      balanceAtoms: holder.balanceAtoms.toString(),
      inclusionState: holder.inclusionState,
      sourceRecordId: holder.sourceRecordId,
      pageOrdinal: holder.sourcePageOrdinal,
      itemOrdinal: holder.sourceItemOrdinal,
      ...(holder.classificationReference ? { classificationReference: holder.classificationReference } : {}),
    })),
    materialSourceRecordIds: [...value.materialSourceRecordIds],
    payloadFingerprints: [...value.payloadFingerprints],
    observedAt: value.observedAt,
    availableAt: value.availableAt,
    snapshotId: value.snapshotId,
    snapshotFingerprint: value.fingerprint,
    recordedAt: value.recordedAt,
    ...overrides,
  };
}

describe("M5 holder concentration authority", () => {
  it("builds a frozen complete snapshot and derives exact single/top10 BPS", () => {
    const result = deriveM5HolderConcentration(snapshot(), asOf);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.single.valueAtoms).toBe(1_799n);
    expect(result.top10.valueAtoms).toBe(9_893n);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.holders)).toBe(true);
    expect(result.single.scale).toBe(0);
    expect(result.single.unit).toBe("BPS");
    expect("eligibility" in result).toBe(false);
  });

  it("uses mathematical ceiling division and rejects unsafe ratios", () => {
    expect(concentrationBps(1n, 3n)).toBe(3334n);
    expect(concentrationBps(3n, 3n)).toBe(10_000n);
    expect(concentrationBps(0n, 3n)).toBe(0n);
    expect(() => concentrationBps(1n, 0n)).toThrow();
    expect(() => concentrationBps(4n, 3n)).toThrow();
  });

  it("is permutation invariant and sorts ties by address", () => {
    const base = material();
    const reversed = { ...base, holders: [...base.holders].reverse(), fullPaginationProof: { ...base.fullPaginationProof, pages: [...base.fullPaginationProof.pages].reverse() } };
    const first = snapshot();
    const second = snapshot(reversed);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it.each([
    ["duplicate holder", { holders: [...material().holders.slice(0, 11), { ...material().holders[0] }] }, "M5_HOLDER_DUPLICATE"],
    ["count mismatch", { declaredHolderCount: 11 }, "M5_HOLDER_COUNT_MISMATCH"],
    ["supply mismatch", { denominatorAtoms: 999n }, "M5_HOLDER_SUPPLY_RECONCILIATION_INVALID"],
    ["negative balance", { holders: material().holders.map((holder, index) => index === 0 ? { ...holder, balanceAtoms: -1n } : holder) }, "M5_HOLDER_RANGE_INVALID"],
    ["circulating supply", { supplyBasis: "CIRCULATING_SUPPLY" }, "M5_HOLDER_SUPPLY_BASIS_UNSUPPORTED"],
    ["explicit exclusion", { addressPolicy: "EXPLICIT_EXCLUSIONS" }, "M5_HOLDER_EXCLUSIONS_UNSUPPORTED"],
  ])("rejects %s", (_name, overrides, code) => {
    expect(() => snapshot(overrides as Record<string, unknown>)).toThrow(code);
  });

  it("requires finality and rejects future availability", () => {
    const lowFinality = parseM5HolderSnapshotFixture(fixture(snapshot(), { finality: { status: "CONFIRMED", depth: 1 } }));
    expect(lowFinality.status).toBe("INCOMPLETE");
    const future = deriveM5HolderConcentration(snapshot({ availableAt: "2026-02-02T00:00:00.000Z" }), asOf);
    expect(future.status).toBe("INVALID");
  });

  it("enforces complete pages, exact payloads and duplicate rejection", () => {
    const value = snapshot();
    const valid = parseM5HolderSnapshotFixture(fixture(value));
    expect(valid.status).toBe("READY");
    const missingFinal = parseM5HolderSnapshotFixture(fixture(value, { fullPaginationProof: { ...fixture(value).fullPaginationProof, pages: fixture(value).fullPaginationProof.pages.map(page => ({ ...page, isFinal: false })) } }));
    expect(missingFinal.status).toBe("INCOMPLETE");
    const extraPayload = parseM5HolderSnapshotFixture(fixture(value, { payloadFingerprints: [...value.payloadFingerprints, "d".repeat(64)] }));
    expect(extraPayload.status).toBe("INVALID");
    const secret = parseM5HolderSnapshotFixture(fixture(value, { apiKey: "not-printed" }));
    expect(secret.status).toBe("INVALID");
    if (secret.status === "INVALID") expect(secret.diagnostics).toContain("M5_HOLDER_SECRET_FIELD_REJECTED");
  });

  it("validates identity, timestamps and deep immutability at the fixture boundary", () => {
    const value = snapshot();
    const parsed = parseM5HolderSnapshotFixture(fixture(value));
    expect(parsed.status).toBe("READY");
    if (parsed.status !== "READY") return;
    expect(Object.isFrozen(parsed.snapshot.fullPaginationProof.pages[0])).toBe(true);
    const badAddress = parseM5HolderSnapshotFixture(fixture(value, { contractAddress: "0X0000000000000000000000000000000000000001" }));
    expect(badAddress.status).toBe("INVALID");
    const badTime = parseM5HolderSnapshotFixture(fixture(value, { blockTimestamp: "2026-02-02T00:00:00.000Z" }));
    expect(badTime.status).toBe("INVALID");
  });

  it("keeps recordedAt outside identity and fingerprint material", () => {
    const first = snapshot({ recordedAt: "2026-02-01T00:02:00.000Z" });
    const second = snapshot({ recordedAt: "2026-02-03T00:02:00.000Z" });
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("changes identity when any authority material changes", () => {
    const base = snapshot();
    const changed = [
      snapshot({ providerId: "other-provider" }),
      snapshot({ blockHash: `0x${"b".repeat(64)}` }),
      snapshot({ availableAt: "2026-02-01T00:02:00.000Z" }),
      snapshot({ materialSourceRecordIds: ["holder-page-0", "holder-page-2"], holders: material().holders.map(holder => holder.sourcePageOrdinal === 1 ? { ...holder, sourceRecordId: "holder-page-2" } : holder), fullPaginationProof: { ...material().fullPaginationProof, pages: material().fullPaginationProof.pages.map((page, index) => index === 1 ? { ...page, sourceRecordIds: ["holder-page-2"] } : page) } }),
      snapshot({ payloadFingerprints: [`${"d".repeat(64)}`, `${"e".repeat(64)}`], fullPaginationProof: { ...material().fullPaginationProof, pages: material().fullPaginationProof.pages.map((page, index) => ({ ...page, payloadFingerprint: index === 0 ? "d".repeat(64) : "e".repeat(64) })) } }),
    ];
    for (const value of changed) expect(value.fingerprint).not.toBe(base.fingerprint);
  });

  it("rejects unknown material fields, duplicate pages and invalid fingerprints", () => {
    const value = snapshot();
    const unknown = parseM5HolderSnapshotFixture(fixture(value, { unsupported: true }));
    expect(unknown.status).toBe("INVALID");
    const duplicatePage = parseM5HolderSnapshotFixture(fixture(value, { fullPaginationProof: { ...fixture(value).fullPaginationProof, pages: [...fixture(value).fullPaginationProof.pages, { ...fixture(value).fullPaginationProof.pages[1], pageOrdinal: 1 }] } }));
    expect(duplicatePage.status).toBe("INCOMPLETE");
    const invalidFingerprint = parseM5HolderSnapshotFixture(fixture(value, { snapshotFingerprint: "not-sha" }));
    expect(invalidFingerprint.status).toBe("INVALID");
  });

  it("preserves bigint precision for large atom values", () => {
    const large = 9_007_199_254_740_993n;
    const value = snapshot({
      holders: [{ ...material().holders[0], balanceAtoms: large, address: "0x0000000000000000000000000000000000000001", sourcePageOrdinal: 0, sourceItemOrdinal: 0, ordinal: 0 }],
      declaredHolderCount: 1,
      denominatorAtoms: large,
      fullPaginationProof: { pageCount: 1, finalPageOrdinal: 0, pages: [{ ...material().fullPaginationProof.pages[0], itemCount: 1, isFinal: true }] },
      materialSourceRecordIds: ["holder-page-0"],
      payloadFingerprints: [material().fullPaginationProof.pages[0]!.payloadFingerprint],
    });
    const result = deriveM5HolderConcentration(value, asOf);
    expect(result.status).toBe("READY");
    if (result.status === "READY") expect(result.single.valueAtoms).toBe(10_000n);
  });
});
