/* eslint-disable @typescript-eslint/no-explicit-any -- synthetic malformed payloads are deliberately mutated across unknown object shapes. */
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import {
  EVENT_INTELLIGENCE_PERSISTENCE_DECISION_PRODUCTION_CONFIG as production,
  EVENT_INTELLIGENCE_PERSISTENCE_DECISION_TABLES as tables,
  EVENT_INTELLIGENCE_PERSISTENCE_EXTERNAL_PARENT_UNIQUE_KEYS as externalKeys,
  EVENT_INTELLIGENCE_PERSISTENCE_EXTERNAL_PARENT_COLUMN_TYPES as externalTypes,
  getEventIntelligencePersistenceDecision,
  parseEventIntelligencePersistenceDecision,
} from "@/domain/intelligence/event-intelligence-persistence-decision";

const reviewed = "2026-10-01T00:00:00.000Z";
const parsed = () => getEventIntelligencePersistenceDecision(reviewed, "2026-10-01T00:01:00.000Z");
const clone = (value: unknown): any => JSON.parse(JSON.stringify(value));
const reseal = (decision: any) => {
  const body = { contractVersion: decision.contractVersion, status: decision.status, tables: [...decision.tables].sort((a: any,b: any) => a.name.localeCompare(b.name)), reviewedAt: decision.reviewedAt, blockers: [...decision.blockers].sort() };
  decision.fingerprint = canonicalSha256(body);
  decision.decisionId = `event-persistence-decision:${decision.fingerprint}`;
  return decision;
};

describe("event-intelligence persistence schema/UoW decision", () => {
  it("parses the versioned design and deeply freezes nested descriptors", () => {
    const decision = parsed();
    expect(decision.contractVersion).toBe("event-intelligence-persistence-decision/v1");
    expect(decision.status).toBe("DECISION_ONLY");
    expect(decision.tables).toHaveLength(11);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.tables[0])).toBe(true);
    expect(Object.isFrozen(decision.tables[0]?.columns)).toBe(true);
    expect(Object.isFrozen(decision.tables[0]?.columns[0])).toBe(true);
    expect(decision.tables.every(table => table.indexNames.length === table.indexes.length && table.indexNames.every(name => name.length <= 63))).toBe(true);
  });

  it("keeps recordedAt outside deterministic material identity", () => {
    const first = getEventIntelligencePersistenceDecision(reviewed, "2026-10-01T00:01:00.000Z");
    const later = getEventIntelligencePersistenceDecision(reviewed, "2026-10-02T00:01:00.000Z");
    expect(first.fingerprint).toBe(later.fingerprint);
    expect(first.decisionId).toBe(later.decisionId);
  });

  it("round-trips through serialization with a stable fingerprint", () => {
    const first = parsed();
    const second = parseEventIntelligencePersistenceDecision(clone(first));
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.decisionId).toBe(first.decisionId);
    expect(Object.isFrozen(second.tables[0]?.foreignKeys[0])).toBe(true);
  });

  it("rejects unknown, inherited, accessor, proxy and non-plain records", () => {
    const valid = clone(parsed());
    expect(() => parseEventIntelligencePersistenceDecision({ ...valid, extra: true })).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    expect(() => parseEventIntelligencePersistenceDecision(Object.assign(Object.create({ inherited: true }), valid))).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const accessor = { ...valid };
    Object.defineProperty(accessor, "reviewedAt", { enumerable: true, get() { throw new Error("SYNTHETIC_SENTINEL"); } });
    expect(() => parseEventIntelligencePersistenceDecision(accessor)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    let traps = 0;
    expect(() => parseEventIntelligencePersistenceDecision(new Proxy(valid, { get() { traps++; throw new Error("SYNTHETIC_SENTINEL"); } }))).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    expect(traps).toBe(0);
    expect(() => parseEventIntelligencePersistenceDecision({ ...valid, tables: new Date() })).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
  });

  it("rejects duplicate tables, columns, keys, indexes and unsafe arrays", () => {
    const duplicateTable = clone(parsed()); duplicateTable.tables.push(duplicateTable.tables[0]);
    expect(() => parseEventIntelligencePersistenceDecision(duplicateTable)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const duplicateColumn = clone(parsed()); duplicateColumn.tables[0].columns.push(duplicateColumn.tables[0].columns[0]);
    expect(() => parseEventIntelligencePersistenceDecision(duplicateColumn)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const sparse = clone(parsed()); sparse.tables[0].blockers = new Array(1);
    expect(() => parseEventIntelligencePersistenceDecision(sparse)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const unsafeArray = clone(parsed()); Object.setPrototypeOf(unsafeArray.tables, { polluted: true });
    expect(() => parseEventIntelligencePersistenceDecision(unsafeArray)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const indexedAccessor = clone(parsed()); let indexGetterCalls = 0;
    Object.defineProperty(indexedAccessor.blockers, "0", { enumerable: true, configurable: true, get() { indexGetterCalls++; throw new Error("SYNTHETIC_SENTINEL"); } });
    expect(() => parseEventIntelligencePersistenceDecision(indexedAccessor)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    expect(indexGetterCalls).toBe(0);
  });

  it("requires globally unique PostgreSQL FK constraint names within the proposed schema", () => {
    const duplicateNames = clone(parsed());
    const first = duplicateNames.tables.find((table: any) => table.foreignKeys.length > 0);
    const second = duplicateNames.tables.find((table: any) => table !== first && table.foreignKeys.length > 0);
    second.foreignKeys[0].name = first.foreignKeys[0].name;
    expect(() => parseEventIntelligencePersistenceDecision(reseal(duplicateNames))).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_FK_DESCRIPTOR_INVALID");
    const longName = clone(parsed());
    const child = longName.tables.find((table: any) => table.foreignKeys.length > 0);
    child.foreignKeys[0].name = "f".repeat(64);
    expect(() => parseEventIntelligencePersistenceDecision(reseal(longName))).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_FK_DESCRIPTOR_INVALID");
  });

  it("requires PKs, valid canonical identifiers, structured parent keys and child FK indexes", () => {
    const noPk = clone(parsed()); noPk.tables[0].primaryKey = [];
    expect(() => parseEventIntelligencePersistenceDecision(noPk)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const nullablePk = clone(parsed()); nullablePk.tables[0].columns.find((column: any) => column.name === nullablePk.tables[0].primaryKey[0]).nullable = true;
    expect(() => parseEventIntelligencePersistenceDecision(reseal(nullablePk))).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const badIdentifier = clone(parsed()); badIdentifier.tables[0].name = "event_authorityhttps://example.com";
    expect(() => parseEventIntelligencePersistenceDecision(badIdentifier)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const noIndex = clone(parsed()); const row = noIndex.tables.find((item: any) => item.name === "event_claims"); row.indexes = row.indexes.filter((index: string[]) => index[0] !== "availability_claim_id");
    expect(() => parseEventIntelligencePersistenceDecision(noIndex)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const badParent = clone(parsed()); const fk = badParent.tables[0].foreignKeys[0]; fk.parentColumns = ["not_unique"];
    expect(() => parseEventIntelligencePersistenceDecision(badParent)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_FK_DESCRIPTOR_INVALID");
  });

  it("validates every declared FK against an exact parent key and child index", () => {
    const names = new Set(tables.map(table => table.name));
    for (const child of tables) for (const fk of child.foreignKeys) {
      const parent = tables.find(table => table.name === fk.parentTable);
      const candidateKeys = parent ? [...parent.uniqueKeys, parent.primaryKey] : (externalKeys as Record<string, readonly (readonly string[])[]>)[fk.parentTable];
      expect(candidateKeys, `${child.name}.${fk.name} parent catalog`).toBeDefined();
      expect(candidateKeys!.some(key => key.length === fk.parentColumns.length && key.every((column, index) => column === fk.parentColumns[index]))).toBe(true);
      expect(fk.columns.every(column => child.columns.some(candidate => candidate.name === column))).toBe(true);
      expect(child.indexes.some(index => index.length >= fk.columns.length && fk.columns.every((column, indexPosition) => index[indexPosition] === column))).toBe(true);
      if (parent) for (let i = 0; i < fk.columns.length; i++) {
        expect(child.columns.find(column => column.name === fk.columns[i])?.type).toBe(parent.columns.find(column => column.name === fk.parentColumns[i])?.type);
      }
      else {
        expect(names.has(fk.parentTable)).toBe(false);
        for (let i = 0; i < fk.columns.length; i++) expect(child.columns.find(column => column.name === fk.columns[i])?.type).toBe(externalTypes[fk.parentTable]?.[fk.parentColumns[i]]);
      }
    }
  });

  it("reports the original scope-deficient lineage FK without loosening validation", () => {
    const invalid = clone(parsed());
    const child = invalid.tables.find((table: any) => table.name === "event_issuer_mapping_authorities");
    const fk = child.foreignKeys.find((item: any) => item.name === "issuer_authority_lineage_fk");
    fk.columns = ["source_lineage_id", "source_lineage_fingerprint"];
    fk.parentColumns = ["source_lineage_id", "fingerprint"];
    child.indexes.push(["source_lineage_id", "source_lineage_fingerprint"]);
    child.indexNames.push("event_issuer_lineage_fingerprint_idx");
    reseal(invalid);
    expect(() => parseEventIntelligencePersistenceDecision(invalid)).toThrow(
      "EVENT_INTELLIGENCE_PERSISTENCE_FK_PARENT_KEY_INVALID child=event_issuer_mapping_authorities fk=issuer_authority_lineage_fk childColumns=source_lineage_id,source_lineage_fingerprint parent=intelligence_source_lineages referencedColumns=source_lineage_id,fingerprint catalogKeys=(source_lineage_id,provider_id,dataset_id,dataset_version)"
    );
  });

  it.each([
    ["reversed FK columns", (d: any) => { const fk = d.tables.find((t: any) => t.name === "event_issuer_mapping_authorities").foreignKeys.find((f: any) => f.name === "issuer_authority_lineage_fk"); fk.columns.reverse(); fk.parentColumns.reverse(); }],
    ["missing scope column", (d: any) => { const fk = d.tables.find((t: any) => t.name === "event_issuer_mapping_authorities").foreignKeys.find((f: any) => f.name === "issuer_authority_lineage_fk"); fk.columns.pop(); fk.parentColumns.pop(); }],
    ["parent key prefix", (d: any) => { const fk = d.tables.find((t: any) => t.name === "event_issuer_mapping_authorities").foreignKeys.find((f: any) => f.name === "issuer_authority_lineage_fk"); fk.columns = fk.columns.slice(0, 1); fk.parentColumns = fk.parentColumns.slice(0, 1); }],
    ["non-unique parent index reference", (d: any) => { const fk = d.tables.find((t: any) => t.name === "event_issuer_mapping_authorities").foreignKeys.find((f: any) => f.name === "issuer_authority_lineage_fk"); fk.columns = ["source_lineage_id","source_lineage_fingerprint"]; fk.parentColumns = ["source_lineage_id","fingerprint"]; }],
    ["partial unique parent reference", (d: any) => { const fk = d.tables.find((t: any) => t.name === "event_issuer_mapping_authorities").foreignKeys.find((f: any) => f.name === "issuer_authority_lineage_fk"); fk.columns = ["source_lineage_id","source_lineage_fingerprint"]; fk.parentColumns = ["source_lineage_id","fingerprint"]; }],
    ["unknown parent", (d: any) => { d.tables[0].foreignKeys[0].parentTable = "unknown_parent_table"; }],
    ["missing child index", (d: any) => { const child = d.tables.find((t: any) => t.name === "event_issuer_mapping_authorities"); child.indexes = child.indexes.filter((index: string[]) => index[0] !== "source_lineage_id"); }],
    ["duplicate index name", (d: any) => { d.tables[1].indexNames[0] = d.tables[0].indexNames[0]; }],
    ["overlength PostgreSQL index name", (d: any) => { d.tables[0].indexNames[0] = "i".repeat(64); }],
    ["duplicate FK constraint name", (d: any) => { const child = d.tables[0]; child.foreignKeys[1].name = child.foreignKeys[0].name; }],
  ])("rejects %s after recomputing its material fingerprint", (_name, mutate) => {
    const invalid = clone(parsed()); mutate(invalid); reseal(invalid);
    expect(() => parseEventIntelligencePersistenceDecision(invalid)).toThrow();
  });

  it("rejects non-immutable authority tables and unsealed authority parents", () => {
    const noTrigger = clone(parsed()); noTrigger.tables[0].immutableTrigger = null;
    expect(() => parseEventIntelligencePersistenceDecision(noTrigger)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
    const unsealed = clone(parsed()); const authority = unsealed.tables.find((item: any) => item.name === "event_issuer_disclosure_authorities"); authority.sealedMemberSet = false;
    expect(() => parseEventIntelligencePersistenceDecision(unsealed)).toThrow("EVENT_INTELLIGENCE_PERSISTENCE_DECISION_INVALID");
  });

  it("does not encode client policies, enabled persistence or non-issuer authority", () => {
    expect(production.schemaApproved).toBe(false);
    expect(production.migrationApproved).toBe(false);
    expect(production.localRuntimeVerified).toBe(false);
    expect(production.persistenceEnabled).toBe(false);
    expect(production.issuerDisclosureAuthorityEnabled).toBe(false);
    expect(production.externallyVerifiedFact).toBe("UNSUPPORTED");
    expect(production.issuerMappings).toEqual([]);
    expect(production.assetMentionBindings).toEqual([]);
    expect(production.scheduler).toBe("BLOCKED");
    expect(production.signal).toBe("BLOCKED");
    expect(production.trading).toBe("BLOCKED");
    expect(tables.every(table => table.rls === "ENABLED_NO_POLICIES" && table.immutableTrigger === "reject_intelligence_mutation")).toBe(true);
  });
});
