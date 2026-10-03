import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_REVIEW_QUEUE_READ_MODEL_LIMITS,
  EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG,
  getEvidenceReviewQueueReadModelDecision,
  getEvidenceReviewQueueReadModelProductionConfig,
  parseEvidenceReviewQueueReadModelDecision,
  parseEvidenceReviewQueueReadModelProductionConfig,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-read-model-decision";

const RECORDED = "2026-10-03T10:00:00.000Z";
const decision = () => getEvidenceReviewQueueReadModelDecision(RECORDED);
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as object).sort((a,b) => a < b ? -1 : a > b ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
function reseal(value: Record<string, unknown>): Record<string, unknown> {
  const material = { ...value };
  delete material.decisionId;
  delete material.fingerprint;
  delete material.recordedAt;
  const fingerprint = createHash("sha256").update(canonical(material), "utf8").digest("hex");
  return { ...material, decisionId: `event-queue-read-model-decision:${fingerprint}`, fingerprint, recordedAt: RECORDED };
}

describe("evidence review queue read-model decision", () => {
  it("pins immutable snapshot strategy while leaving production blocked", () => {
    const value = decision();
    expect(value.status).toBe("DECISION_ONLY_BLOCKED_UPSTREAM");
    expect(value.selectedStrategy).toBe("IMMUTABLE_DERIVED_SNAPSHOT");
    expect(value.alternatives.map(item => item.disposition)).toEqual(["REJECTED_AS_V1_READ_PATH", "REJECTED", "RECOMMENDED_V1_AFTER_BLOCKERS", "INSUFFICIENT_FOR_AUDITABLE_HISTORY"]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.snapshotPolicy.identityFields)).toBe(true);
    expect(Object.isFrozen(value.schemaCatalog.records[0])).toBe(true);
    expect(parseEvidenceReviewQueueReadModelProductionConfig(getEvidenceReviewQueueReadModelProductionConfig())).toEqual(EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG);
    expect(value.blockers.length).toBeGreaterThan(0);
  });

  it("uses deterministic material fingerprint and excludes recordedAt", () => {
    const a = decision();
    const b = getEvidenceReviewQueueReadModelDecision("2026-10-03T11:00:00.000Z");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.decisionId).toBe(b.decisionId);
    expect(b.recordedAt).not.toBe(a.recordedAt);
    expect(parseEvidenceReviewQueueReadModelDecision(JSON.parse(JSON.stringify(a)))).toMatchObject({ status: "VALID", decision: { fingerprint: a.fingerprint } });
  });

  it("rejects unknown strategy, status, extra/missing fields and duplicate references", () => {
    const value = decision() as unknown as Record<string, unknown>;
    expect(parseEvidenceReviewQueueReadModelDecision({ ...value, unexpected: true }).status).toBe("INVALID");
    const missing = { ...value }; delete missing.selectedStrategy;
    expect(parseEvidenceReviewQueueReadModelDecision(missing).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueReadModelDecision(reseal({ ...value, selectedStrategy: "RECOMPUTE_ON_EVERY_READ" })).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueReadModelDecision(reseal({ ...value, status: "READY" })).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueReadModelDecision(reseal({ ...value, blockers: ["CALLER_REMOVED_BLOCKERS"] })).status).toBe("INVALID");
    const overlongAlternative = [...value.alternatives as Array<Record<string, unknown>>];
    overlongAlternative[0] = { ...overlongAlternative[0], rationale: "x".repeat(2049) };
    expect(parseEvidenceReviewQueueReadModelDecision({ ...value, alternatives: overlongAlternative }).status).toBe("INVALID");
    const refs = [...value.references as Array<Record<string, unknown>>]; refs[1] = refs[0]!;
    expect(parseEvidenceReviewQueueReadModelDecision(reseal({ ...value, references: refs })).status).toBe("INVALID");
  });

  it("rejects inherited, accessor, symbol, sparse, non-plain and proxy inputs without executing caller code", () => {
    const value = decision() as unknown as Record<string, unknown>;
    let calls = 0;
    const getter = { ...value, get selectedStrategy() { calls++; return value.selectedStrategy; } };
    expect(parseEvidenceReviewQueueReadModelDecision(getter).status).toBe("INVALID");
    const symbol = { ...value, [Symbol("extra")]: true };
    expect(parseEvidenceReviewQueueReadModelDecision(symbol).status).toBe("INVALID");
    const inherited = Object.assign(Object.create({ polluted: true }), value);
    expect(parseEvidenceReviewQueueReadModelDecision(inherited).status).toBe("INVALID");
    const sparseRefs = new Array((value.references as unknown[]).length);
    expect(parseEvidenceReviewQueueReadModelDecision({ ...value, references: sparseRefs }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueReadModelDecision({ ...value, alternatives: new Date() }).status).toBe("INVALID");
    const proxy = new Proxy(value, { get() { calls++; throw new Error("SENTINEL"); }, ownKeys() { calls++; throw new Error("SENTINEL"); }, getPrototypeOf() { calls++; throw new Error("SENTINEL"); } });
    expect(parseEvidenceReviewQueueReadModelDecision(proxy).status).toBe("INVALID");
    expect(calls).toBe(0);
  });

  it("enforces canonical times, bounds and non-authoritative snapshot invariants", () => {
    const value = decision() as unknown as Record<string, unknown>;
    expect(parseEvidenceReviewQueueReadModelDecision({ ...value, recordedAt: "2026-10-03T10:00:00Z" }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueReadModelDecision({ ...value, blockers: Array(1000).fill("X") }).status).toBe("INVALID");
    expect(EVIDENCE_REVIEW_QUEUE_READ_MODEL_LIMITS.payloadBytes).toBe(1_048_576);
    expect(value.snapshotPolicy).toMatchObject({ payloadEncoding: "EXACT_CANONICAL_UTF8_JSON_BYTES", replay: expect.stringContaining("EXACT_REREAD"), conflict: expect.stringContaining("ROLLS_BACK") });
    expect((value.snapshotPolicy as Record<string, unknown>).excludedFields).toContain("storedAt");
    expect(value.historyPolicy).toMatchObject({ appendOnly: true, payloadUpdate: "FORBIDDEN" });
  });

  it("keeps authority classes separate and requires typed family-specific provenance", () => {
    const value = decision();
    expect(value.authorityBoundary.persistedSnapshot).toContain("not");
    expect(value.authorityBoundary.prohibitions).toContain("EVENT_AUTHORITY");
    expect(value.snapshotPolicy.provenanceManifest).toContain("FAMILY_SPECIFIC");
    expect(value.schemaCatalog.nonexistentRequiredParents).toContain("event_issuer_mapping_authorities (only a design descriptor; not in tracked applied migrations)");
    expect(value.schemaCatalog.records[0]?.foreignKeys).toEqual([]);
  });

  it("reconciles proposed parent keys with tracked applied migrations and exposes missing event parents", () => {
    const sec = readFileSync("supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql", "utf8").replace(/\s+/g, " ");
    const m5 = readFileSync("supabase/migrations/20260916212845_m5_mapping_lineage.sql", "utf8").replace(/\s+/g, " ");
    const trackedMigrations = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).map(name => readFileSync(`supabase/migrations/${name}`, "utf8")).join("\n");
    expect(sec).toContain("unique(lineage_id,fingerprint)");
    expect(sec).toContain("unique(artifact_id,fingerprint)");
    expect(m5).toContain("unique (mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)");
    expect(m5).not.toContain("unique (mapping_revision_id, source_lineage_id,");
    expect(trackedMigrations).not.toContain("event_intelligence_evidence_review_queue_snapshots");
    const files = readFileSync("docs/SEC_EDGAR_EVENT_SOURCE_PROVENANCE_DECISION.md", "utf8");
    expect(files).toContain("issuer evidence");
    expect(valueFromDecision().schemaCatalog.nonexistentRequiredParents.join(" ")).toContain("event_claims_and_correction_lineages");
  });

  it("production config cannot be upgraded and keeps retention/deletion separate", () => {
    const config = getEvidenceReviewQueueReadModelProductionConfig();
    expect(config).toMatchObject({ status: "BLOCKED", selectedStrategy: "IMMUTABLE_DERIVED_SNAPSHOT", selectedBackend: null, snapshotPersistence: "BLOCKED", currentSelection: "BLOCKED", readPath: "BLOCKED", retention: "NOT_APPROVED", deletion: "NOT_APPROVED", authorityUpgrade: "UNSUPPORTED", signal: "BLOCKED", trading: "BLOCKED" });
    expect(Object.values(config.approvals).every(value => value === "NOT_APPROVED")).toBe(true);
    expect(parseEvidenceReviewQueueReadModelProductionConfig({ ...config, status: "READY" })).toBeNull();
    expect(parseEvidenceReviewQueueReadModelProductionConfig({ ...config, credentials: ["x"] })).toBeNull();
    expect(parseEvidenceReviewQueueReadModelProductionConfig(new Proxy(config, { ownKeys() { throw new Error("SENTINEL"); } }))).toBeNull();
  });
});

function valueFromDecision() { return decision(); }
