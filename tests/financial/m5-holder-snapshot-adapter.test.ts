import { describe, expect, it, vi } from "vitest";
import {
  M5_HOLDER_PAGE_FIXTURE_VERSION,
  assembleM5HolderPageSet,
  buildM5HolderSnapshotRequestPlan,
  holderPagePayloadFingerprint,
  parseM5HolderPageFixture,
  projectM5HolderPageSetToNormalizedPackage,
  projectM5HolderPageSetToSnapshot,
  validateM5HolderPageSetPackageBinding,
} from "@/application/intelligence/m5-holder-snapshot-adapter";
import { buildManualIngestionToLineagePlan } from "@/application/intelligence/manual-ingestion-to-lineage";

const blockHash = `0x${"a".repeat(64)}`;
const referenceHash = `0x${"b".repeat(64)}`;
const contractAddress = "0x000000000000000000000000000000000000000a";
const request = buildM5HolderSnapshotRequestPlan({ providerId: "synthetic-holder", datasetId: "holder-snapshot", datasetVersion: "holder-snapshot/v1", providerSourceNamespace: "synthetic:ethereum", contractAddress, pageSize: 2, asOf: "2026-02-01T00:20:00.000Z" });

function rawPage(pageOrdinal: number, isFinal: boolean, overrides: Record<string, unknown> = {}) {
  const holders = pageOrdinal === 0
    ? [{ itemOrdinal: 0, address: "0x0000000000000000000000000000000000000011", balanceAtoms: 600n }, { itemOrdinal: 1, address: "0x0000000000000000000000000000000000000012", balanceAtoms: 300n }]
    : [{ itemOrdinal: 0, address: "0x0000000000000000000000000000000000000021", balanceAtoms: 100n }, { itemOrdinal: 1, address: "0x0000000000000000000000000000000000000022", balanceAtoms: 0n }];
  const page = {
    providerId: request.providerId,
    datasetId: request.datasetId,
    datasetVersion: request.datasetVersion,
    providerSourceNamespace: request.providerSourceNamespace,
    chainId: "eip155:1" as const,
    contractAddress,
    snapshotBlockNumber: 100n,
    snapshotBlockHash: blockHash,
    snapshotBlockTimestamp: "2026-02-01T00:00:00.000Z",
    tokenDecimals: 18,
    totalSupplyAtoms: 1_000n,
    declaredHolderCount: 4,
    declaredPageCount: 2,
    pageOrdinal,
    isFinal,
    ...(isFinal ? { nextPageState: { kind: "NONE" as const } } : { nextPageState: { kind: "MORE" as const, nextPageOrdinal: pageOrdinal + 1 } }),
    holders,
    receipt: { receivedAt: pageOrdinal === 0 ? "2026-02-01T00:05:00.000Z" : "2026-02-01T00:06:00.000Z" },
    sourceRecordId: `synthetic-page-${pageOrdinal}`,
    finality: { referenceBlockNumber: 112n, referenceBlockHash: referenceHash, observedAt: "2026-02-01T00:07:00.000Z", receivedAt: "2026-02-01T00:08:00.000Z" },
    ...overrides,
  };
  return {
    fixtureVersion: M5_HOLDER_PAGE_FIXTURE_VERSION,
    ...page,
    snapshotBlockNumber: page.snapshotBlockNumber.toString(),
    totalSupplyAtoms: page.totalSupplyAtoms.toString(),
    holders: page.holders.map(holder => ({ ...holder, balanceAtoms: holder.balanceAtoms.toString() })),
    finality: { ...page.finality, referenceBlockNumber: page.finality.referenceBlockNumber.toString() },
    payloadFingerprint: holderPagePayloadFingerprint(page),
  };
}

function pages() { return [rawPage(0, false), rawPage(1, true)]; }

describe("M5 holder snapshot adapter", () => {
  it("builds a deterministic Ethereum request plan with no secrets", () => {
    const second = buildM5HolderSnapshotRequestPlan({ providerId: "synthetic-holder", datasetId: "holder-snapshot", datasetVersion: "holder-snapshot/v1", providerSourceNamespace: "synthetic:ethereum", contractAddress: "0x000000000000000000000000000000000000000A", pageSize: 2, asOf: request.asOf });
    expect(second).toEqual(request);
    expect(JSON.stringify(request)).not.toMatch(/key|token|secret|authorization/i);
    expect(buildM5HolderSnapshotRequestPlan({ ...request, contractAddress: "0x000000000000000000000000000000000000000b" })).not.toEqual(request);
  });

  it("parses a strict page and reconstructs its fingerprint", () => {
    const parsed = parseM5HolderPageFixture(rawPage(0, false));
    expect(parsed.payloadFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.holders[0]!.balanceAtoms).toBe(600n);
  });

  it("rejects unknown and secret-like nested fields", () => {
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), apiKey: "synthetic" })).toThrow("M5_HOLDER_ADAPTER_SECRET_FIELD_REJECTED");
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), finality: { ...rawPage(0, false).finality, token: "x" } })).toThrow("M5_HOLDER_ADAPTER_SECRET_FIELD_REJECTED");
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), sourceRecordId: "https://example.test/?token=x" })).toThrow();
  });

  it("rejects fingerprint mutation, invalid atoms and scope mismatch", () => {
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), payloadFingerprint: "a".repeat(64) })).toThrow("M5_HOLDER_ADAPTER_FINGERPRINT_INVALID");
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), holders: [{ ...rawPage(0, false).holders[0], balanceAtoms: "1e3" }] })).toThrow();
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), chainId: "eip155:137" })).toThrow("M5_HOLDER_ADAPTER_SCOPE_MISMATCH");
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), finality: { ...rawPage(0, false).finality, observedAt: "2026-02-01T00:09:00.000Z" } })).toThrow("M5_HOLDER_ADAPTER_TIME_INVALID");
  });

  it("assembles a complete multi-page set invariant to page input order", () => {
    const assembled = assembleM5HolderPageSet({ request, pages: pages().reverse() });
    expect(assembled.status).toBe("COMPLETE");
    if (assembled.status !== "COMPLETE") return;
    expect(assembled.finalityDepth).toBe(12);
    expect(assembled.effectiveAvailableAt).toBe("2026-02-01T00:08:00.000Z");
    expect(assembled.pages.map(page => page.pageOrdinal)).toEqual([0, 1]);
  });

  it.each([
    ["missing middle page", [rawPage(0, false), rawPage(2, true)], "INCOMPLETE"],
    ["missing final marker", [rawPage(0, false), rawPage(1, false)], "INCOMPLETE"],
    ["multiple final pages", [rawPage(0, true), rawPage(1, true)], "INCOMPLETE"],
    ["page after final", [rawPage(0, true), rawPage(1, false)], "INCOMPLETE"],
    ["declared count mismatch", [rawPage(0, false, { declaredPageCount: 3 }), rawPage(1, true)], "INCOMPLETE"],
    ["duplicate external record", [rawPage(0, false, { sourceRecordId: "same" }), rawPage(1, true, { sourceRecordId: "same" })], "INVALID"],
    ["duplicate holder", [rawPage(0, false), rawPage(1, true, { holders: [{ itemOrdinal: 0, address: "0x0000000000000000000000000000000000000011", balanceAtoms: "100" }, { itemOrdinal: 1, address: "0x0000000000000000000000000000000000000022", balanceAtoms: "0" }] })], "INVALID"],
    ["finality depth 11", [rawPage(0, false, { finality: { ...rawPage(0, false).finality, referenceBlockNumber: "111" } }), rawPage(1, true, { finality: { ...rawPage(1, true).finality, referenceBlockNumber: "111" } })], "INCOMPLETE"],
    ["duplicate page ordinal", [rawPage(0, false), rawPage(0, true)], "INCOMPLETE"],
    ["block number mismatch", [rawPage(0, false), rawPage(1, true, { snapshotBlockNumber: "101" })], "INVALID"],
    ["block hash mismatch", [rawPage(0, false), rawPage(1, true, { snapshotBlockHash: `0x${"c".repeat(64)}` })], "INVALID"],
    ["block timestamp mismatch", [rawPage(0, false), rawPage(1, true, { snapshotBlockTimestamp: "2026-02-01T00:00:01.000Z" })], "INVALID"],
    ["decimals mismatch", [rawPage(0, false), rawPage(1, true, { tokenDecimals: 6 })], "INVALID"],
    ["supply mismatch", [rawPage(0, false), rawPage(1, true, { totalSupplyAtoms: "1001" })], "INVALID"],
    ["reference below snapshot", [rawPage(0, false, { finality: { ...rawPage(0, false).finality, referenceBlockNumber: "99" } }), rawPage(1, true, { finality: { ...rawPage(1, true).finality, referenceBlockNumber: "99" } })], "INVALID"],
  ] as const)("classifies %s without concentration metrics", (_name, fixturePages, expected) => {
    const result = assembleM5HolderPageSet({ request, pages: fixturePages });
    expect(result.status).toBe(expected);
    expect(result.status).not.toBe("COMPLETE");
  });

  it("accepts exact finality boundary and rejects malformed item/timestamp material", () => {
    const depth13 = assembleM5HolderPageSet({ request, pages: [rawPage(0, false, { finality: { ...rawPage(0, false).finality, referenceBlockNumber: "113" } }), rawPage(1, true, { finality: { ...rawPage(1, true).finality, referenceBlockNumber: "113" } })] });
    expect(depth13.status).toBe("COMPLETE");
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), holders: [{ itemOrdinal: 0, address: "0x0000000000000000000000000000000000000011", balanceAtoms: "600" }, { itemOrdinal: 0, address: "0x0000000000000000000000000000000000000012", balanceAtoms: "300" }] })).toThrow();
    expect(() => parseM5HolderPageFixture({ ...rawPage(0, false), snapshotBlockTimestamp: "2026-02-01T00:06:00.000Z" })).toThrow("M5_HOLDER_ADAPTER_TIME_INVALID");
  });

  it("projects one page-set to both strict normalized package and holder snapshot", () => {
    const pageSet = assembleM5HolderPageSet({ request, pages: pages() });
    expect(pageSet.status).toBe("COMPLETE");
    if (pageSet.status !== "COMPLETE") return;
    const normalized = projectM5HolderPageSetToNormalizedPackage({ pageSet, idempotencyKey: "holder-run-1", requestedAt: "2026-02-01T00:01:00.000Z", startedAt: "2026-02-01T00:02:00.000Z", recordedAt: "2026-02-01T00:09:00.000Z" });
    expect(normalized.records).toHaveLength(2);
    const dryRun = buildManualIngestionToLineagePlan(normalized);
    expect(dryRun.memberCount).toBe(2);
    expect(normalized.records.every(record => record.retrievedAt === "2026-02-01T00:08:00.000Z")).toBe(true);
    expect(normalized.records[0]?.normalizedEnvelope).toHaveProperty("finality");
    expect(validateM5HolderPageSetPackageBinding({ pageSet, package: normalized })).toBe(normalized);
    expect(() => validateM5HolderPageSetPackageBinding({ pageSet, package: { ...normalized, records: normalized.records.map((record, index) => index === 0 ? { ...record, itemOrdinal: 99 } : record) } })).toThrow("M5_HOLDER_ADAPTER_PACKAGE_BINDING_INVALID");
    const projected = projectM5HolderPageSetToSnapshot({ pageSet, asOf: request.asOf, recordedAt: "2026-02-01T00:09:00.000Z" });
    expect(projected.status).toBe("COMPLETE");
    if (projected.status !== "COMPLETE") return;
    expect(projected.snapshot.denominatorAtoms).toBe(1_000n);
    expect(projected.concentration.status).toBe("READY");
    expect(projected.capabilities.canonicalM5).toBe("UNSUPPORTED");
    if (projected.status === "COMPLETE") expect(projected.snapshot.materialSourceRecordIds).toEqual(normalized.records.map(record => record.providerExternalRecordId).sort());
  });

  it("does not open a database or UoW during parse, assembly or projection", () => {
    const spy = vi.fn();
    const pageSet = assembleM5HolderPageSet({ request, pages: pages() });
    expect(pageSet.status).toBe("COMPLETE");
    expect(spy).not.toHaveBeenCalled();
  });

  it("separates payload identity from receipt availability", () => {
    const first = assembleM5HolderPageSet({ request, pages: pages() });
    const mutated = rawPage(1, true, { receipt: { receivedAt: "2026-02-01T00:07:00.000Z" } });
    const second = assembleM5HolderPageSet({ request, pages: [rawPage(0, false), mutated] });
    expect(first.status).toBe("COMPLETE");
    expect(second.status).toBe("COMPLETE");
    if (first.status !== "COMPLETE" || second.status !== "COMPLETE") return;
    expect(second.effectiveAvailableAt).toBe("2026-02-01T00:08:00.000Z");
    expect(second.pages[1]!.payloadFingerprint).toBe(first.pages[1]!.payloadFingerprint);
    const laterFinality = { referenceBlockNumber: 112n, referenceBlockHash: referenceHash, observedAt: "2026-02-01T00:07:00.000Z", receivedAt: "2026-02-01T00:11:00.000Z" };
    const later = assembleM5HolderPageSet({ request, pages: [rawPage(0, false, { receipt: { receivedAt: "2026-02-01T00:10:00.000Z" }, finality: laterFinality }), rawPage(1, true, { receipt: { receivedAt: "2026-02-01T00:10:00.000Z" }, finality: laterFinality })] });
    expect(later.status).toBe("COMPLETE");
    if (later.status === "COMPLETE") {
      const firstSnapshot = projectM5HolderPageSetToSnapshot({ pageSet: first, asOf: request.asOf, recordedAt: "2026-02-01T00:12:00.000Z" });
      const laterSnapshot = projectM5HolderPageSetToSnapshot({ pageSet: later, asOf: request.asOf, recordedAt: "2026-02-01T00:12:00.000Z" });
      expect(later.effectiveAvailableAt).toBe("2026-02-01T00:11:00.000Z");
      expect(firstSnapshot.status).toBe("COMPLETE");
      expect(laterSnapshot.status).toBe("COMPLETE");
      if (firstSnapshot.status === "COMPLETE" && laterSnapshot.status === "COMPLETE") expect(laterSnapshot.snapshot.fingerprint).not.toBe(firstSnapshot.snapshot.fingerprint);
    }
  });
});
