import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";

export const EVIDENCE_REVIEW_QUEUE_READ_MODEL_DECISION_VERSION = "event-intelligence-evidence-review-queue-read-model-decision/v1" as const;
export const EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG_VERSION = "event-intelligence-evidence-review-queue-read-model-production/v1" as const;
export const EVIDENCE_REVIEW_QUEUE_READ_MODEL_LIMITS = Object.freeze({ payloadBytes: 1_048_576, provenanceReferences: 256, referencesPerFamily: 64 });

export type EvidenceReviewQueueReadModelDecision = Readonly<{
  contractVersion: typeof EVIDENCE_REVIEW_QUEUE_READ_MODEL_DECISION_VERSION;
  decisionId: string;
  fingerprint: string;
  status: "DECISION_ONLY_BLOCKED_UPSTREAM";
  selectedStrategy: "IMMUTABLE_DERIVED_SNAPSHOT";
  alternatives: readonly Readonly<{ strategy: string; disposition: string; rationale: string }>[];
  materialClasses: readonly Readonly<{ material: string; classification: string; persistence: string }>[];
  authorityBoundary: Readonly<{ sourceArtifacts: string; mappingAuthorities: string; routingResults: string; queueItemsAndSets: string; viewModel: string; persistedSnapshot: string; currentSelection: string; humanReviewOutcome: string; prohibitions: readonly string[] }>;
  snapshotPolicy: Readonly<{ identityFields: readonly string[]; excludedFields: readonly string[]; payloadEncoding: string; canonicalization: string; digestAlgorithm: "SHA-256"; readValidation: string; payloadFormat: string; maxPayloadBytes: number; replay: string; conflict: string; storageRowIdentity: string; provenanceManifest: string }>;
  historyPolicy: Readonly<{ appendOnly: true; payloadUpdate: "FORBIDDEN"; correctionRetraction: string; historicalCutoff: string; supersession: string; policyUpgrade: string; currentSelection: string }>;
  schemaCatalog: Readonly<{ records: readonly Readonly<{ name: string; purpose: string; primaryIdentity: readonly string[]; uniqueKeys: readonly (readonly string[])[]; foreignKeys: readonly Readonly<{ name: string; childColumns: readonly string[]; parentTable: string; parentColumns: readonly string[]; status: string }>[]; indexes: readonly (readonly string[])[]; nullableInvariants: readonly string[]; rls: string; privileges: string; immutableTrigger: string; blockers: readonly string[] }>[]; omittedRecords: readonly Readonly<{ name: string; disposition: string }>[]; appliedParentKeys: readonly Readonly<{ table: string; columns: readonly string[]; evidencePath: string; scope: string }>[]; nonexistentRequiredParents: readonly string[] }>;
  transactionPolicy: Readonly<{ isolation: string; lockOrder: string; insert: string; reread: string; identicalWriter: string; conflictingWriter: string; rollback: string; timeoutsCancellation: string; retries: string; seal: string; currentSelectionRace: string; authorityWrites: "FORBIDDEN" }>;
  readPolicy: Readonly<{ scope: string; validation: readonly string[]; failure: string; uiOutput: string; fixturesFallback: "FORBIDDEN" }>;
  accessPolicy: Readonly<{ serverOnly: true; rls: string; clientPolicies: string; clientPrivileges: string; serviceRole: string; repositoryRole: string; databaseFunctions: string; logs: string }>;
  rightsAndRetention: Readonly<{ sourceContent: string; sourceMetadata: string; derivedCandidates: string; queueSnapshots: string; uiPayload: string; logs: string; backupsWalPitr: string; deletion: string; redistribution: string; commercialUse: string; requiredApprovals: readonly string[] }>;
  blockers: readonly string[];
  references: readonly Readonly<{ kind: string; path: string; claim: string }>[];
  reviewedAt: string;
  recordedAt: string;
}>;

export type EvidenceReviewQueueReadModelProductionConfig = Readonly<{
  contractVersion: typeof EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG_VERSION;
  status: "BLOCKED";
  selectedStrategy: "IMMUTABLE_DERIVED_SNAPSHOT" | null;
  selectedBackend: null;
  snapshotPersistence: "BLOCKED";
  currentSelection: "BLOCKED";
  readPath: "BLOCKED";
  retention: "NOT_APPROVED";
  deletion: "NOT_APPROVED";
  authorityUpgrade: "UNSUPPORTED";
  signal: "BLOCKED";
  trading: "BLOCKED";
  approvals: Readonly<Record<string, "NOT_APPROVED">>;
  blockers: readonly string[];
}>;

const DECISION_BODY = Object.freeze({
  contractVersion: EVIDENCE_REVIEW_QUEUE_READ_MODEL_DECISION_VERSION,
  status: "DECISION_ONLY_BLOCKED_UPSTREAM" as const,
  selectedStrategy: "IMMUTABLE_DERIVED_SNAPSHOT" as const,
  alternatives: Object.freeze([
    Object.freeze({ strategy: "RECOMPUTE_ON_EVERY_READ", disposition: "REJECTED_AS_V1_READ_PATH", rationale: "Current code and upstream authority persistence are incomplete; policy changes could silently change old views, and replay requires historical code/config availability. Recompute is useful only as an explicit rebuild operation producing a new immutable snapshot." }),
    Object.freeze({ strategy: "PERSIST_DOMAIN_ROUTING_OR_QUEUE_OBJECTS_AS_AUTHORITY", disposition: "REJECTED", rationale: "Database rows cannot restore module-local runtime trust, and derived routing/queue contracts are never source, mapping, corroboration, event, signal, or trading authority." }),
    Object.freeze({ strategy: "IMMUTABLE_DERIVED_SNAPSHOT", disposition: "RECOMMENDED_V1_AFTER_BLOCKERS", rationale: "A cutoff- and contract-pinned canonical safe view-model snapshot preserves what a reviewed evaluation displayed while remaining a rebuildable, non-authoritative read model." }),
    Object.freeze({ strategy: "EPHEMERAL_CACHE_ONLY", disposition: "INSUFFICIENT_FOR_AUDITABLE_HISTORY", rationale: "Cache loss/invalidation removes historical review state; correction/retraction replay and recovery are not durable. It may be an optimization only after a durable snapshot exists." }),
  ]),
  materialClasses: Object.freeze([
    Object.freeze({ material: "SOURCE_ARTIFACTS_AND_CLAIMS", classification: "AUTHORITY_ONLY_WITH_SEPARATELY_APPROVED_SOURCE_CONTRACT", persistence: "SEPARATE_SOURCE_FAMILY_AUTHORITY" }),
    Object.freeze({ material: "ISSUER_AND_ASSET_MAPPING_AUTHORITIES", classification: "SEPARATE_MAPPING_AUTHORITY", persistence: "SEPARATE_IMMUTABLE_AUTHORITY" }),
    Object.freeze({ material: "ROUTING_RESULT", classification: "DERIVED_NON_AUTHORITATIVE", persistence: "NOT_PERSISTED_AS_DOMAIN_OBJECT" }),
    Object.freeze({ material: "EVIDENCE_REVIEW_QUEUE_ITEM_AND_SET", classification: "DERIVED_NON_AUTHORITATIVE", persistence: "NOT_PERSISTED_AS_DOMAIN_OBJECT" }),
    Object.freeze({ material: "SERIALIZABLE_VIEW_MODEL", classification: "DEGRADED_PRESENTATION_DATA", persistence: "SNAPSHOT_PAYLOAD_ONLY_AFTER_APPROVAL" }),
    Object.freeze({ material: "SELECTED_EVALUATION_AS_OF_SNAPSHOT", classification: "HISTORICAL_READ_MODEL", persistence: "IMMUTABLE_APPEND_ONLY" }),
    Object.freeze({ material: "HUMAN_REVIEW_OUTCOME", classification: "SEPARATE_UNSPECIFIED_CONTRACT", persistence: "NOT_IN_THIS_DECISION" }),
  ]),
  authorityBoundary: Object.freeze({
    sourceArtifacts: "Authority only within a separately qualified and approved source-family contract; a locator or digest alone is not source authority.",
    mappingAuthorities: "Separate runtime-authentic and/or separately persisted mapping authority; text/ticker/hostname and read-model rows do not map.",
    routingResults: "Derived policy output; database parsing cannot restore runtime trust.",
    queueItemsAndSets: "Derived review projections; database parsing cannot restore runtime trust.",
    viewModel: "One-way degraded serializable presentation contract; never a domain input.",
    persistedSnapshot: "Immutable derived read model, not evidence truth, claim authority, or a trust token.",
    currentSelection: "Presentation selection among exact snapshots; never an authority or current-truth assertion.",
    humanReviewOutcome: "Not represented; requires a separately reviewed, actor-scoped, auditable contract.",
    prohibitions: Object.freeze(["SOURCE_AUTHORITY", "ISSUER_MAPPING_AUTHORITY", "ASSET_MAPPING_AUTHORITY", "CORROBORATION_AUTHORITY", "EVENT_AUTHORITY", "SIGNAL_ELIGIBILITY", "TRADING_ELIGIBILITY"]),
  }),
  snapshotPolicy: Object.freeze({
    identityFields: Object.freeze(["snapshotContractVersion", "compositionContractVersion", "routingDecisionVersionAndFingerprint", "queueContractVersion", "viewModelContractVersion", "evaluationAsOf", "canonicalCandidateMemberSetIdentity", "correctionRetractionContext", "jurisdictionAndScope", "degradationAndBlockerState", "canonicalProvenanceManifestFingerprint", "safePayloadFingerprint"]),
    excludedFields: Object.freeze(["storedAt", "databaseTransactionTime", "readAt", "recordedAt", "currentSelection", "receiptAttemptId", "queueProjectionTime"]),
    payloadEncoding: "UTF8_NO_BOM_SINGLE_JSON_VALUE_NO_TRAILING_NEWLINE",
    canonicalization: "event-review-view-model-canonical-json/v1: preserve array order; sort object keys by UTF-16 code-unit order; JSON-escape strings without Unicode normalization or newline conversion; allow only null, booleans, strings, arrays, plain objects, and finite safe integers; reject duplicate keys and unsupported values.",
    digestAlgorithm: "SHA-256" as const,
    readValidation: "Enforce byte cap before decode; fatal UTF-8 decode; exact schema/version parse; recompute SHA-256 over original bytes; canonicalize parsed value and require byte-for-byte equality; compare exact metadata, manifest, payload, and identity on authoritative reread.",
    payloadFormat: "PARENT_VIEW_MODEL_CONTRACT_EXACT_SCHEMA_NO_DOMAIN_OBJECTS",
    maxPayloadBytes: EVIDENCE_REVIEW_QUEUE_READ_MODEL_LIMITS.payloadBytes,
    replay: "SAME_SCOPE_AND_SNAPSHOT_IDENTITY_INSERT_DO_NOTHING_THEN_EXACT_REREAD; IDENTICAL_CANONICAL_MATERIAL_CONVERGES",
    conflict: "SAME_SCOPE_AND_SNAPSHOT_IDENTITY_WITH_DIFFERENT_CANONICAL_MANIFEST_OR_PAYLOAD_IS_A_CONFLICT_AND_ROLLS_BACK",
    storageRowIdentity: "SCOPE_IDENTITY_PLUS_DOMAIN_SEPARATED_SNAPSHOT_IDENTITY; scope identity is an unresolved logical placeholder, not an existing column or approved parent key",
    provenanceManifest: "CANONICAL_TYPED_FAMILY_SPECIFIC_REFERENCE_SET; references must resolve to their own approved parent authority; generic free-text referenceId is forbidden",
  }),
  historyPolicy: Object.freeze({
    appendOnly: true as const,
    payloadUpdate: "FORBIDDEN" as const,
    correctionRetraction: "A visible correction or retraction creates a new evaluation snapshot at/after its publication and retains all older snapshots; unresolved lineage blocks current selection.",
    historicalCutoff: "Explicit evaluationAsOf; include only evidence available by cutoff; evaluationAsOf is distinct from evaluatedAt, storedAt, and readAt.",
    supersession: "A later snapshot may be marked superseded only by a versioned deterministic selection/rebuild relation; superseded and historical are separate fields. No prior row is updated.",
    policyUpgrade: "New decision/routing/queue/view-model versions create a different snapshot identity. Old payloads remain readable only by their exact old schema reader or fail closed; never reinterpret them under new rules.",
    currentSelection: "No persisted pointer in v1. Derive the latest eligible snapshot for the exact scope, cutoff, and pinned contract fingerprint; ties/conflicts or unresolved correction/retraction block selection. This is presentation-only and reconstructible.",
  }),
  schemaCatalog: Object.freeze({
    records: Object.freeze([
      Object.freeze({ name: "event_intelligence_evidence_review_queue_snapshots", purpose: "One complete immutable canonical safe-view-model snapshot plus its typed provenance manifest and exact contract/cutoff pins.", primaryIdentity: Object.freeze(["snapshot_id"]), uniqueKeys: Object.freeze([Object.freeze(["scope_identity", "snapshot_identity"])]), foreignKeys: Object.freeze([]), indexes: Object.freeze([Object.freeze(["scope_identity", "evaluation_as_of", "snapshot_id"])]), nullableInvariants: Object.freeze(["No optional identity/scope/provenance field may be partially null; version/fingerprint group nullability is all-or-none."]), rls: "ENABLE_AND_FORCE_RLS; no client policies", privileges: "REVOKE ALL FROM PUBLIC, anon, authenticated; future dedicated server repository grant only after separate approval", immutableTrigger: "Reuse verified immutable mutation-rejection trigger only after actual function semantics are reviewed; add insert-only enforcement; no UPDATE/DELETE", blockers: Object.freeze(["NO_APPROVED_SCOPE_IDENTITY_OR_EXISTING_PARENT_KEY", "NO_COMPLETE_SOURCE_FAMILY_PROVENANCE_PARENT_CATALOG", "SNAPSHOT_SCHEMA_NOT_APPROVED"]) }),
    ]),
    omittedRecords: Object.freeze([
      Object.freeze({ name: "snapshot_member_table", disposition: "NOT_SELECTED_IN_V1: the bounded complete canonical payload and manifest are one parent row; no separately sealed member set is needed. If later normalized, require ordered child members, exact member count/digest, parent-before-member writes, child FK indexes, and deferred commit-time sealing." }),
      Object.freeze({ name: "current_selection_pointer", disposition: "NOT_SELECTED_IN_V1: derive deterministic presentation selection from immutable rows; do not persist a pointer that can stale or hide a retraction." }),
      Object.freeze({ name: "rebuild_or_audit_attempt_table", disposition: "NOT_SELECTED: operational attempt logs need their own data-minimization, scope, access, and retention approval; do not make them snapshot provenance authority." }),
    ]),
    appliedParentKeys: Object.freeze([
      Object.freeze({ table: "sec_event_source_lineages", columns: Object.freeze(["lineage_id", "fingerprint"]), evidencePath: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql", scope: "SEC event-source lineage only; not a generic issuer/news provenance parent." }),
      Object.freeze({ table: "sec_event_document_artifacts", columns: Object.freeze(["artifact_id", "fingerprint"]), evidencePath: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql", scope: "SEC document artifact only; not a generic source or issuer claim." }),
      Object.freeze({ table: "intelligence_asset_mapping_revisions", columns: Object.freeze(["mapping_revision_id", "source_lineage_id", "provider_id", "dataset_id", "dataset_version", "canonical_asset_id", "canonical_identifier", "asset_class"]), evidencePath: "supabase/migrations/20260918215043_m5_raw_source_lineage.sql", scope: "Final applied M5 lineage-scoped mapping identity UNIQUE; the initial seven-column identity key was dropped. This remains asset-mapping provenance, not issuer/event-claim authority." }),
      Object.freeze({ table: "intelligence_asset_mapping_revisions", columns: Object.freeze(["mapping_revision_id", "provider_id", "dataset_id", "dataset_version", "canonical_asset_id", "canonical_identifier", "asset_class"]), evidencePath: "supabase/migrations/20260920161300_m5_suspicious_assessment_authority.sql", scope: "Additional applied UNIQUE key for assessment binding; distinct from and compatible with the final lineage-scoped key." }),
      Object.freeze({ table: "intelligence_source_lineages", columns: Object.freeze(["source_lineage_id", "provider_id", "dataset_id", "dataset_version"]), evidencePath: "supabase/migrations/20260917012625_m5_source_lineage.sql", scope: "Applied M5 source-lineage parent key referenced by the mapping table; not an issuer-release or generic event-claim parent." }),
      Object.freeze({ table: "intelligence_datasets", columns: Object.freeze(["dataset_id", "provider_id", "dataset_version"]), evidencePath: "supabase/migrations/20260916212845_m5_mapping_lineage.sql", scope: "Applied dataset-owner parent key referenced by the mapping table." }),
      Object.freeze({ table: "intelligence_providers", columns: Object.freeze(["provider_id"]), evidencePath: "supabase/migrations/20260916212845_m5_mapping_lineage.sql", scope: "Applied provider primary key referenced by the mapping table." }),
      Object.freeze({ table: "intelligence_provider_asset_identity_assertions", columns: Object.freeze(["provider_asset_identity_assertion_id", "provider_id", "dataset_id", "dataset_version", "provider_source_namespace", "provider_asset_id"]), evidencePath: "supabase/migrations/20260918234933_m5_provider_asset_identity.sql", scope: "Applied provider-asset identity assertion parent key referenced by M5 mapping; not Money Machine issuer or canonical asset mapping authority." }),
    ]),
    nonexistentRequiredParents: Object.freeze(["event_issuer_mapping_authorities (only a design descriptor; not in tracked applied migrations)", "event_claims_and_correction_lineages (not in tracked applied migrations)", "issuer-release-source artifact authority (not in tracked applied migrations)", "approved event-intelligence tenant/scope parent key (not established by this read-model contract)"]),
  }),
  transactionPolicy: Object.freeze({
    isolation: "READ_COMMITTED_WITH_EXACT_IMMUTABLE_IDENTITY_AND_EXACT_REREAD; verify on approved PostgreSQL runtime before implementation",
    lockOrder: "V1 has one snapshot row and no member locks. Resolve immutable typed provenance parents in fixed family order, then binary canonical identity order; write none of those parent families. Any mutable parent/member/current-pointer design needs a separate concurrency decision.",
    insert: "Insert snapshot parent first with exact immutable identity; ON CONFLICT DO NOTHING only on the exact selected identity constraint.",
    reread: "Reread from a new statement snapshot, compare exact metadata, manifest bytes, payload length, payload digest, and canonical bytes before returning.",
    identicalWriter: "Concurrent identical writers converge only after exact reread proves byte/material equality.",
    conflictingWriter: "Same identity with any differing canonical material aborts; never UPDATE/upsert payload.",
    rollback: "Any insert/reread/schema/seal failure rolls back the entire write; no partial snapshot is visible.",
    timeoutsCancellation: "Bound statement and transaction duration; cancellation or timeout rolls back. If commit outcome is unknown, do not infer failure or retry internally; resolve with an exact identity lookup in a later explicit call.",
    retries: "No internal automatic retry; timeout/deadlock/serialization failure returns sanitized unknown outcome and a later explicit retry resolves by exact lookup.",
    seal: "Single-row payload and manifest are complete before insert; if members are normalized later, deferred commit-time exact count/contiguous ordinal/digest sealing is mandatory.",
    currentSelectionRace: "No write-side current pointer in v1; read selection is a deterministic query over immutable matching snapshots.",
    authorityWrites: "FORBIDDEN" as const,
  }),
  readPolicy: Object.freeze({
    scope: "Require a separately authenticated exact workspace/scope plus requested evaluationAsOf and exact supported schema/contract pins; no unscoped latest query.",
    validation: Object.freeze(["Exact row schema and version", "Bounded exact payload and provenance-manifest bytes", "Recompute SHA-256 over exact bytes", "Exact authoritative reread and identity/material comparison", "Strict view-model schema validation and timestamp/cutoff invariants", "Resolve typed provenance references under their own approved family contracts", "Return only the safe view-model; never parse rows as trusted domain objects"]),
    failure: "Any unknown schema, partial member, digest mismatch, missing source parent, future evidence, unresolved required correction, or scope conflict returns the deterministic sanitized blocked production model; never repair or return a partial queue.",
    uiOutput: "The parent serializable view-model is the only UI output. No fingerprints, IDs, raw material, provenance references, or trust brands cross that boundary.",
    fixturesFallback: "FORBIDDEN" as const,
  }),
  accessPolicy: Object.freeze({
    serverOnly: true as const,
    rls: "RLS enabled and forced on every future exposed-schema snapshot table; private schema is preferred if application access supports it; no policy is created until exact actor/scope model is approved.",
    clientPolicies: "NONE; no anon/authenticated policies or grants.",
    clientPrivileges: "REVOKE ALL from PUBLIC, anon, authenticated; no client or service-role credential in browser.",
    serviceRole: "RLS alone does not protect against a BYPASSRLS/service-role credential; no such credential, browser path, grant, or bypass assumption is approved.",
    repositoryRole: "No role/grant selected; a narrowly scoped server-only role requires separate least-privilege and RLS review. No bypass-RLS/service-role assumption is approved.",
    databaseFunctions: "No function required for v1 single-row inserts; any future function SECURITY INVOKER, fixed search_path, EXECUTE revoked by default; no SECURITY DEFINER.",
    logs: "Sanitized categorical errors only; no payload, source text, identifiers, fingerprints, credentials, or raw DB errors.",
  }),
  rightsAndRetention: Object.freeze({
    sourceContent: "NOT_APPROVED; no source body is stored in the queue snapshot.",
    sourceMetadata: "NOT_APPROVED; separate approval required per source family.",
    derivedCandidates: "NOT_APPROVED; derived candidate retention requires explicit purpose and scope approval.",
    queueSnapshots: "NOT_APPROVED; derivation does not inherit source storage rights.",
    uiPayload: "NOT_APPROVED; server-to-client presentation does not approve durable storage.",
    logs: "UNKNOWN/NOT_APPROVED; retention and redaction policy required before runtime.",
    backupsWalPitr: "NOT_APPROVED; backup/WAL/PITR retention and deletion windows must be included in approval.",
    deletion: "NOT_APPROVED; no tombstone/physical-erasure policy or authorized actor exists.",
    redistribution: "NOT_APPROVED",
    commercialUse: "NOT_APPROVED",
    requiredApprovals: Object.freeze(["source acquisition", "source processing", "source-content storage", "source-metadata storage", "derived-candidate storage", "queue-snapshot storage", "retention", "deletion", "backup/WAL/PITR handling", "redistribution", "commercial use", "access-control and scope owner"]),
  }),
  blockers: Object.freeze(["UPSTREAM_SOURCE_AND_CLAIM_PERSISTENCE_NOT_APPROVED", "ISSUER_MAPPING_AUTHORITY_PARENT_NOT_APPLIED", "ISSUER_CLAIM_AND_CORRECTION_LINEAGE_PARENTS_NOT_APPLIED", "EVENT_SCOPE_AND_ACCESS_CONTROL_KEY_UNRESOLVED", "SOURCE_FAMILY_SPECIFIC_PROVENANCE_FKS_INCOMPLETE", "SOURCE_AND_DERIVED_READ_MODEL_STORAGE_RIGHTS_NOT_APPROVED", "RETENTION_DELETION_AND_BACKUP_POLICY_NOT_APPROVED", "DATABASE_RUNTIME_AND_REPOSITORY_NOT_APPROVED"]),
  references: Object.freeze([
    Object.freeze({ kind: "INTERNAL_DECISION", path: "docs/EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_COMPOSITION.md", claim: "Composition is in-memory, synthetic, non-authoritative, and production remains blocked." }),
    Object.freeze({ kind: "INTERNAL_DECISION", path: "docs/EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_VIEW_MODEL.md", claim: "Safe serializable UI model and one-way trust degradation." }),
    Object.freeze({ kind: "INTERNAL_DECISION", path: "docs/EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_CONTRACT.md", claim: "Queue items/sets are derived review projections, not authority." }),
    Object.freeze({ kind: "INTERNAL_DECISION", path: "docs/EVENT_INTELLIGENCE_PERSISTENCE_SCHEMA_UOW_DECISION.md", claim: "Existing event-persistence design is unapproved and must be reconciled with separate provenance families." }),
    Object.freeze({ kind: "INTERNAL_DECISION", path: "docs/SEC_EDGAR_EVENT_SOURCE_PROVENANCE_DECISION.md", claim: "SEC source provenance is distinct from M5 ingestion, issuer evidence, and asset mapping provenance." }),
    Object.freeze({ kind: "INTERNAL_DECISION", path: "docs/SEC_EVENT_DOCUMENT_BYTE_STORAGE_DECISION.md", claim: "Byte storage and retention approval remain separate and blocked." }),
    Object.freeze({ kind: "INTERNAL_APPLIED_MIGRATION", path: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql", claim: "Applied SEC-only source lineage and document artifact keys; not generic event claims." }),
    Object.freeze({ kind: "INTERNAL_APPLIED_MIGRATION", path: "supabase/migrations/20260918215043_m5_raw_source_lineage.sql", claim: "Later applied M5 migration adds source_lineage_id and replaces the original mapping identity key with the final eight-column lineage identity key." }),
    Object.freeze({ kind: "INTERNAL_APPLIED_MIGRATION", path: "supabase/migrations/20260920161300_m5_suspicious_assessment_authority.sql", claim: "Adds a separate seven-column mapping assessment UNIQUE key; it does not remove the final lineage identity key." }),
  ]),
  reviewedAt: "2026-10-03T00:00:00.000Z",
});

type DecisionBody = typeof DECISION_BODY;
export type EvidenceReviewQueueReadModelDecisionValue = Readonly<DecisionBody & { decisionId: string; fingerprint: string; recordedAt: string }>;
type DecisionParse = Readonly<{ status: "VALID"; decision: EvidenceReviewQueueReadModelDecisionValue }> | Readonly<{ status: "INVALID"; code: "READ_MODEL_DECISION_INVALID" }>;
const INVALID_DECISION: DecisionParse = Object.freeze({ status: "INVALID", code: "READ_MODEL_DECISION_INVALID" });
const PRODUCTION_CONFIG = Object.freeze({
  contractVersion: EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG_VERSION,
  status: "BLOCKED" as const,
  selectedStrategy: null,
  selectedBackend: null,
  snapshotPersistence: "BLOCKED" as const,
  currentSelection: "BLOCKED" as const,
  readPath: "BLOCKED" as const,
  retention: "NOT_APPROVED" as const,
  deletion: "NOT_APPROVED" as const,
  authorityUpgrade: "UNSUPPORTED" as const,
  signal: "BLOCKED" as const,
  trading: "BLOCKED" as const,
  approvals: Object.freeze({ sourceAcquisition: "NOT_APPROVED", sourceProcessing: "NOT_APPROVED", sourceContentStorage: "NOT_APPROVED", sourceMetadataStorage: "NOT_APPROVED", derivedCandidateStorage: "NOT_APPROVED", queueSnapshotStorage: "NOT_APPROVED", persistence: "NOT_APPROVED", retention: "NOT_APPROVED", deletion: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED", accessScope: "NOT_APPROVED" }),
  blockers: Object.freeze([...DECISION_BODY.blockers]),
});
export const EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG: EvidenceReviewQueueReadModelProductionConfig = PRODUCTION_CONFIG;

const MAX_STRING = 2048;
const SHA = /^[a-f0-9]{64}$/;
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const OBJECT_PROTOTYPE_KEYS = new Set<PropertyKey>(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf", "__proto__"]);
const ARRAY_PROTOTYPE_KEYS = new Set<PropertyKey>(["length", "constructor", "at", "concat", "copyWithin", "fill", "find", "findIndex", "findLast", "findLastIndex", "lastIndexOf", "pop", "push", "reverse", "shift", "unshift", "slice", "sort", "splice", "includes", "indexOf", "join", "keys", "entries", "values", "forEach", "filter", "flat", "flatMap", "map", "every", "some", "reduce", "reduceRight", "toLocaleString", "toString", "toReversed", "toSorted", "toSpliced", "with", Symbol.iterator, Symbol.unscopables]);
const canonical = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort((a,b) => a < b ? -1 : a > b ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  throw new Error("READ_MODEL_DECISION_INVALID");
};
const digest = (value: unknown): string => createHash("sha256").update(canonical(value), "utf8").digest("hex");
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as object)) freeze(child); Object.freeze(value); } return value; };

function safeShape(value: unknown, template: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value && typeof value === "object" && types.isProxy(value)) return false;
  if (Array.isArray(template)) {
    if (Reflect.ownKeys(Array.prototype).some(key => !ARRAY_PROTOTYPE_KEYS.has(key)) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length !== template.length || Reflect.ownKeys(value).length !== length + 1) return false;
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !safeShape(descriptor.value, template[index], depth + 1)) return false;
    }
    return true;
  }
  if (template && typeof template === "object") {
    if (Reflect.ownKeys(Object.prototype).some(key => !OBJECT_PROTOTYPE_KEYS.has(key)) || !value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const templateKeys = Object.keys(template);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== templateKeys.length || keys.some(key => typeof key !== "string" || !templateKeys.includes(key))) return false;
    for (const key of templateKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !safeShape(descriptor.value, (template as Record<string, unknown>)[key], depth + 1)) return false;
    }
    return true;
  }
  if (typeof value !== typeof template) return false;
  if (typeof value === "string") return value.length > 0 && value.length <= MAX_STRING && !/[\p{Cc}\p{Cf}]/u.test(value);
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
  return true;
}

function validTime(value: unknown): value is string { return typeof value === "string" && TIME.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function uniqueStrings(value: readonly string[]): boolean { return new Set(value).size === value.length; }
function decisionMaterial(value: Record<string, unknown>): Record<string, unknown> { const material = { ...value }; delete material.decisionId; delete material.fingerprint; delete material.recordedAt; return material; }

export function parseEvidenceReviewQueueReadModelDecision(input: unknown): DecisionParse {
  try {
    const template = { ...DECISION_BODY, decisionId: "event-queue-read-model-decision:" + "a".repeat(64), fingerprint: "a".repeat(64), recordedAt: "2000-01-01T00:00:00.000Z" };
    if (!safeShape(input, template)) return INVALID_DECISION;
    const value = input as Record<string, unknown>;
    const material = decisionMaterial(value);
    const fingerprint = digest(material);
    if (canonical(material) !== canonical(DECISION_BODY) || !validTime(value.reviewedAt) || !validTime(value.recordedAt) || value.contractVersion !== EVIDENCE_REVIEW_QUEUE_READ_MODEL_DECISION_VERSION || value.status !== "DECISION_ONLY_BLOCKED_UPSTREAM" || value.selectedStrategy !== "IMMUTABLE_DERIVED_SNAPSHOT" || value.fingerprint !== fingerprint || value.decisionId !== `event-queue-read-model-decision:${fingerprint}`) return INVALID_DECISION;
    const arrays = [value.alternatives, value.materialClasses, (value.authorityBoundary as Record<string, unknown>).prohibitions, (value.snapshotPolicy as Record<string, unknown>).identityFields, (value.snapshotPolicy as Record<string, unknown>).excludedFields, (value.schemaCatalog as Record<string, unknown>).records, (value.schemaCatalog as Record<string, unknown>).omittedRecords, (value.schemaCatalog as Record<string, unknown>).appliedParentKeys, (value.schemaCatalog as Record<string, unknown>).nonexistentRequiredParents, (value.blockers), value.references] as string[][];
    if (arrays.some(items => !uniqueStrings(items.map(item => typeof item === "string" ? item : canonical(item))))) return INVALID_DECISION;
    const referencePaths = (value.references as {path:string}[]).map(reference => reference.path);
    if (!SHA.test(fingerprint) || !uniqueStrings(value.blockers as string[]) || !uniqueStrings(referencePaths) || referencePaths.some(path => path.length > 256)) return INVALID_DECISION;
    return Object.freeze({ status: "VALID", decision: freeze({ ...value }) as EvidenceReviewQueueReadModelDecisionValue });
  } catch { return INVALID_DECISION; }
}

export function getEvidenceReviewQueueReadModelDecision(recordedAt: string): EvidenceReviewQueueReadModelDecisionValue {
  if (!validTime(recordedAt)) throw new Error("READ_MODEL_DECISION_INVALID");
  const material = DECISION_BODY as DecisionBody;
  const fingerprint = digest(material);
  const parsed = parseEvidenceReviewQueueReadModelDecision({ ...material, decisionId: `event-queue-read-model-decision:${fingerprint}`, fingerprint, recordedAt });
  if (parsed.status !== "VALID") throw new Error("READ_MODEL_DECISION_INVALID");
  return parsed.decision;
}

export function parseEvidenceReviewQueueReadModelProductionConfig(input: unknown): EvidenceReviewQueueReadModelProductionConfig | null {
  try {
    if (!safeShape(input, PRODUCTION_CONFIG)) return null;
    const value = input as Record<string, unknown>;
    if (value.contractVersion !== EVIDENCE_REVIEW_QUEUE_READ_MODEL_PRODUCTION_CONFIG_VERSION || value.status !== "BLOCKED" || value.selectedBackend !== null || value.snapshotPersistence !== "BLOCKED" || value.currentSelection !== "BLOCKED" || value.readPath !== "BLOCKED" || value.retention !== "NOT_APPROVED" || value.deletion !== "NOT_APPROVED" || value.authorityUpgrade !== "UNSUPPORTED" || value.signal !== "BLOCKED" || value.trading !== "BLOCKED" || value.selectedStrategy !== null || canonical(value) !== canonical(PRODUCTION_CONFIG)) return null;
    return freeze({ ...value }) as EvidenceReviewQueueReadModelProductionConfig;
  } catch { return null; }
}

export function getEvidenceReviewQueueReadModelProductionConfig(): EvidenceReviewQueueReadModelProductionConfig { return PRODUCTION_CONFIG; }
