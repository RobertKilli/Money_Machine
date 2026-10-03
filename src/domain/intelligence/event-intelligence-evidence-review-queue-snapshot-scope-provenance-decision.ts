import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";

export const EVIDENCE_QUEUE_SCOPE_PROVENANCE_DECISION_VERSION = "event-intelligence-evidence-review-queue-snapshot-scope-decision/v1" as const;
export const EVIDENCE_QUEUE_SCOPE_PROVENANCE_CONFIG_VERSION = "event-intelligence-evidence-review-queue-snapshot-scope-production/v1" as const;
export const EVIDENCE_QUEUE_SCOPE_PROVENANCE_LIMITS = Object.freeze({ maxString: 2048, maxArray: 64, maxDepth: 12 });
export const EVIDENCE_QUEUE_PROVENANCE_FAMILIES = Object.freeze([
  "SEC_EVENT_DOCUMENT", "ISSUER_EVIDENCE", "ASSET_MAPPING_REVISION", "DISCOVERY_SOURCE_RECORD",
  "CORRECTION_LINEAGE", "DERIVED_COMPOSITION", "DERIVED_QUEUE_SET", "DERIVED_VIEW_MODEL",
] as const);

export type EvidenceQueueScopeProvenanceDecision = Readonly<{
  contractVersion: typeof EVIDENCE_QUEUE_SCOPE_PROVENANCE_DECISION_VERSION;
  decisionId: string;
  fingerprint: string;
  status: "DECISION_ONLY_BLOCKED_UPSTREAM";
  selectedScopeModel: "EXPLICIT_VERSIONED_REVIEW_UNIVERSE";
  scopePolicy: Readonly<{ identityFields: readonly string[]; excludedFields: readonly string[]; identityEncoding: string; canonicalRules: readonly string[]; changeRules: readonly Readonly<{ change: string; effect: string }>[]; currentSelection: string }>;
  scopeAlternatives: readonly Readonly<{ model: string; disposition: string; rationale: string }>[];
  provenanceFamilies: readonly Readonly<{ family: typeof EVIDENCE_QUEUE_PROVENANCE_FAMILIES[number]; authorityStatus: string; referenceSchema: readonly string[]; identityBinding: string; storage: string; blocker: string }>[];
  appliedParentCatalog: readonly Readonly<{ family: string; table: string; key: readonly string[]; scope: string; immutable: string; futureForeignKey: string; migration: string }>[];
  unsupportedParents: readonly Readonly<{ family: string; missingAuthority: string; disposition: string }>[];
  memberPolicy: Readonly<{ parent: string; memberFields: readonly string[]; ordering: string; sealing: string; origin: string }>;
  correctionPolicy: string;
  rightsAndMinimization: Readonly<{ policy: string; approvals: readonly string[] }>;
  productionBlockers: readonly string[];
  references: readonly Readonly<{ path: string; claim: string }>[];
  reviewedAt: string;
  recordedAt: string;
}>;

/** Syntactic reference only. A VALID result is not proof of parent existence, applied status, or authority. */
export type EvidenceQueueProvenanceReference = Readonly<Record<string, unknown>>;
export type EvidenceQueueProvenanceReferenceParse = Readonly<{ status: "VALID_SYNTAX_ONLY"; reference: EvidenceQueueProvenanceReference }> | Readonly<{ status: "INVALID"; reason: "PROVENANCE_REFERENCE_INVALID" }>;

const BODY = Object.freeze({
  contractVersion: EVIDENCE_QUEUE_SCOPE_PROVENANCE_DECISION_VERSION,
  status: "DECISION_ONLY_BLOCKED_UPSTREAM" as const,
  selectedScopeModel: "EXPLICIT_VERSIONED_REVIEW_UNIVERSE" as const,
  scopePolicy: Object.freeze({
    identityFields: Object.freeze(["scopeContractVersion", "reviewPurpose", "canonicalJurisdictionUniverse", "canonicalEventCategoryUniverse", "canonicalAssetRepresentationUniverse", "issuerListingEligibilityPolicy", "sourcePortfolioDecisionVersionAndMaterial", "routingDecisionVersionAndMaterial", "queueContractVersion", "accessClassification"]),
    excludedFields: Object.freeze(["evaluationAsOf", "storedAt", "receiptTime", "databaseTransactionTime", "uiStatusFilter", "uiPriorityFilter", "uiItemTypeFilter", "freeTextSearch", "visibleHistoricalSubset", "presentationSort", "expandedState", "itemCounts", "snapshotCorrectionRetractionMaterial"]),
    identityEncoding: "Logical scope key is eviqs1_ plus lowercase SHA-256 over UTF-8 canonical scope material, prefixed with event-intelligence-evidence-review-queue-snapshot-scope/v1 NUL domain separation. Canonical object keys use UTF-16 code-unit order; set-like arrays are validated unique and sorted by that order. The key is not candidate, snapshot, payload, row, source, or authority identity; equal key with differing canonical scope is a conflict.",
    canonicalRules: Object.freeze(["Every identity field is required and exact-shape; no implicit trim, lowercase, locale collation, Unicode normalization, or empty-string defaulting.", "Policy references bind immutable contract version plus canonical material identity/fingerprint; mutable display names are insufficient.", "Set-valued jurisdiction, event-category, asset-representation, and issuer/listing policy members are canonical identifiers, unique, bounded, and sorted with UTF-16 code-unit ordering; duplicates reject.", "Unknown values reject except explicit canonical UNKNOWN/UNLISTED policy members where that dimension allows them; arbitrary caller labels cannot stand in for unknown.", "Scope purpose and access classification use separately versioned closed policy enums; access/tenant authority is not inferred or invented here.", "Scope identity is a logical design rule only in this slice; no scope hash resolver or authority is implemented."]),
    changeRules: Object.freeze([
      Object.freeze({ change: "SOURCE_PORTFOLIO_OR_ROUTING_POLICY_REVISION", effect: "NEW_SCOPE_IDENTITY" }),
      Object.freeze({ change: "JURISDICTION_EVENT_ASSET_OR_LISTING_UNIVERSE_CHANGE", effect: "NEW_SCOPE_IDENTITY" }),
      Object.freeze({ change: "QUEUE_CONTRACT_VERSION_OR_ACCESS_CLASSIFICATION_CHANGE", effect: "NEW_SCOPE_IDENTITY" }),
      Object.freeze({ change: "LABEL_OR_DOCUMENTATION_ONLY_CHANGE_WITHOUT_CONTRACT_MATERIAL_CHANGE", effect: "SAME_SCOPE_IDENTITY" }),
      Object.freeze({ change: "CUTOFF_RECEIPT_SNAPSHOT_ITEMS_OR_CORRECTION_CONTEXT_CHANGE", effect: "SAME_SCOPE_NEW_SNAPSHOT_MATERIAL" }),
    ]),
    currentSelection: "No persisted current pointer in v1. Any future selection key binds exact scopeIdentity + exact snapshotIdentity + selectionPolicyVersion + selectedAsOf; it is presentation-only, reconstructible, never global-latest or UI-filter-derived, and cannot hide correction/retraction history.",
  }),
  scopeAlternatives: Object.freeze([
    Object.freeze({ model: "GLOBAL_REVIEW_QUEUE", disposition: "REJECTED_V1", rationale: "A global scope risks jurisdiction mixing, unbounded snapshots, cross-candidate correction confusion, selection races and future access-control ambiguity." }),
    Object.freeze({ model: "JURISDICTION_SCOPE", disposition: "INSUFFICIENT_ALONE", rationale: "It excludes or ambiguously groups unlisted, cross-listed, multi-entity and unknown-jurisdiction candidates; jurisdiction changes would silently move scope." }),
    Object.freeze({ model: "SOURCE_PORTFOLIO_POLICY_SCOPE", disposition: "INSUFFICIENT_ALONE", rationale: "Policy pinning is necessary but does not define purpose, asset/event/listing universe or access classification." }),
    Object.freeze({ model: "EXPLICIT_VERSIONED_REVIEW_UNIVERSE", disposition: "RECOMMENDED_LOGICAL_V1_SCOPE_BLOCKED_FOR_RUNTIME", rationale: "It binds purpose and explicit issuer/listing, jurisdiction, event, asset, source, routing, queue and access policy without treating database convenience as authority. No tenant is invented." }),
  ]),
  provenanceFamilies: Object.freeze([
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", authorityStatus: "APPLIED_PERSISTED_AUTHORITY_WITHIN_SEC_CONTRACT", referenceSchema: Object.freeze(["profile_id", "profile_fingerprint", "filing_identity_id", "artifact_or_package_or_lineage_exact_key"]), identityBinding: "Bind filing/document/package/lineage identity; acquisition receipt is availability evidence, never document identity.", storage: "REFERENCE_ONLY; source bytes stay under separate SEC content/storage contract.", blocker: "Queue snapshot contract, scope, rights and runtime remain unapproved." }),
    Object.freeze({ family: "ISSUER_EVIDENCE", authorityStatus: "UNSUPPORTED_UNIMPLEMENTED_EVENT_EVIDENCE_AUTHORITY", referenceSchema: Object.freeze(["issuer_evidence_contract_version", "issuer_evidence_material_identity", "source_origin_binding"]), identityBinding: "Proposed version-pinned reference syntax for exact source-origin and evidence-member material; it is not an applied issuer evidence contract and accepts no authority by itself.", storage: "REFERENCE_ONLY_IF_SEPARATELY_APPROVED.", blocker: "No applied event issuer-evidence parent authority or merged issuer-source checkpoint." }),
    Object.freeze({ family: "ASSET_MAPPING_REVISION", authorityStatus: "APPLIED_PERSISTED_M5_MAPPING_AUTHORITY_SCOPED_TO_M5", referenceSchema: Object.freeze(["mapping_revision_id", "source_lineage_id", "provider_id", "dataset_id", "dataset_version", "canonical_asset_id", "canonical_identifier", "asset_class"]), identityBinding: "Exact applied eight-column M5 mapping identity; asset representations remain distinct.", storage: "REFERENCE_ONLY; does not imply event-asset mapping approval or snapshot storage rights.", blocker: "No approved event-intelligence mapping bridge or queue persistence." }),
    Object.freeze({ family: "DISCOVERY_SOURCE_RECORD", authorityStatus: "UNSUPPORTED_UNIMPLEMENTED_PERSISTENCE", referenceSchema: Object.freeze(["source_type", "local_candidate_identity", "material_variant_identity", "receipt_metadata_separate"]), identityBinding: "Local source-specific candidate and material variant define reference identity; receiptIdentity is carried as separate receipt metadata and is excluded from material candidate identity.", storage: "SYNTHETIC_OR_REFERENCE_ONLY_PENDING_RIGHTS.", blocker: "No applied NewsAPI/GDELT/issuer-release/exchange source-record parent." }),
    Object.freeze({ family: "CORRECTION_LINEAGE", authorityStatus: "VERSIONED_DOMAIN_NO_APPLIED_EVENT_PERSISTENCE", referenceSchema: Object.freeze(["lineage_contract_version", "root_claim_identity", "ordered_member_identities", "selected_terminal_identity", "evaluationAsOf"]), identityBinding: "Complete authenticated append-only lineage and exact current claim at cutoff; free text cannot establish edge.", storage: "REFERENCE_ONLY_IF_SEPARATELY_APPROVED.", blocker: "No applied normalized event claim/correction parent." }),
    Object.freeze({ family: "DERIVED_COMPOSITION", authorityStatus: "DERIVED_NON_AUTHORITATIVE", referenceSchema: Object.freeze(["composition_contract_version", "composition_material_identity"]), identityBinding: "Exact composition inputs and cutoff actually consumed.", storage: "Derived manifest reference only." , blocker: "No queue snapshot persistence approval." }),
    Object.freeze({ family: "DERIVED_QUEUE_SET", authorityStatus: "DERIVED_NON_AUTHORITATIVE", referenceSchema: Object.freeze(["queue_contract_version", "queue_set_material_identity", "sealed_member_set_identity"]), identityBinding: "Exact sealed canonical member set and shared cutoff.", storage: "Derived manifest reference only.", blocker: "No queue snapshot persistence approval." }),
    Object.freeze({ family: "DERIVED_VIEW_MODEL", authorityStatus: "DERIVED_NON_AUTHORITATIVE", referenceSchema: Object.freeze(["view_model_contract_version", "safe_payload_digest", "payload_length"]), identityBinding: "Exact safe serialized projection; digest supplements and never replaces payload.", storage: "Bounded canonical payload only after separate approval.", blocker: "No snapshot schema, storage or read-path approval." }),
  ]),
  appliedParentCatalog: Object.freeze([
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_source_profiles", key: Object.freeze(["profile_id", "fingerprint"]), scope: "SEC provider/dataset profile; source-profile authority only.", immutable: "Immutable-triggered authority family; RLS/revokes in migration.", futureForeignKey: "EXACT KEY EXISTS; family-specific FK may be considered after snapshot schema approval.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_filing_identities", key: Object.freeze(["filing_identity_id", "profile_id", "profile_fingerprint", "cik", "accession_number", "form"]), scope: "Exact SEC filing identity, profile, registrant and form.", immutable: "Immutable SEC record with scope constraints.", futureForeignKey: "SCOPED KEYS EXIST; exact selected branch must match applied key.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_document_artifacts", key: Object.freeze(["artifact_id", "fingerprint"]), scope: "SEC document artifact; locator/role/sequence scoped additional key exists.", immutable: "Immutable SEC artifact; blob FK is separate.", futureForeignKey: "EXACT KEY EXISTS; package-member branch has a more specific composite key.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_filing_packages", key: Object.freeze(["package_id", "fingerprint", "filing_identity_id"]), scope: "Sealed package scoped to filing identity.", immutable: "Deferred package seal enforces exact count and ordered members.", futureForeignKey: "EXACT KEY EXISTS.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_package_document_members", key: Object.freeze(["package_id", "package_fingerprint", "member_ordinal"]), scope: "Package member with unique artifact and locator within package.", immutable: "Immutable member; package seal validates contiguity/completeness.", futureForeignKey: "EXACT MEMBER AND ARTIFACT SCOPED KEYS EXIST.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_acquisition_receipts", key: Object.freeze(["receipt_id", "package_id", "package_fingerprint"]), scope: "Receipt binds request/attempt/filing/package and available/retrieved times.", immutable: "Immutable receipt; acquisition metadata only.", futureForeignKey: "EXACT KEY EXISTS; never substitute for artifact/document identity.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_source_lineages", key: Object.freeze(["lineage_id", "fingerprint"]), scope: "SEC source profile and sealed package-document lineage.", immutable: "Deferred lineage seal checks member count, order and amendment context.", futureForeignKey: "EXACT KEY EXISTS.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "SEC_EVENT_DOCUMENT", table: "sec_event_source_lineage_members", key: Object.freeze(["lineage_id", "member_ordinal"]), scope: "Ordered member binds package, package member and artifact.", immutable: "Immutable member; lineage seal enforces completeness.", futureForeignKey: "EXACT MEMBER/PACKAGE KEYS EXIST.", migration: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql" }),
    Object.freeze({ family: "ASSET_MAPPING_REVISION", table: "intelligence_asset_mapping_revisions", key: Object.freeze(["mapping_revision_id", "source_lineage_id", "provider_id", "dataset_id", "dataset_version", "canonical_asset_id", "canonical_identifier", "asset_class"]), scope: "Applied M5 lineage-scoped asset mapping; ETH/WETH/native/wrapped/bridged remain separate representations.", immutable: "Immutable M5 authority with applied RLS/revokes; later key changes are reflected in this final key.", futureForeignKey: "EXACT EIGHT-COLUMN KEY EXISTS; only M5-scoped mapping, not event mapping authority.", migration: "supabase/migrations/20260918215043_m5_raw_source_lineage.sql" }),
    Object.freeze({ family: "ASSET_MAPPING_REVISION", table: "intelligence_source_lineages", key: Object.freeze(["source_lineage_id", "provider_id", "dataset_id", "dataset_version"]), scope: "M5 source lineage provider/dataset/version scope.", immutable: "Applied source-lineage authority; not issuer/news lineage.", futureForeignKey: "EXACT FOUR-COLUMN KEY EXISTS.", migration: "supabase/migrations/20260917012625_m5_source_lineage.sql" }),
  ]),
  unsupportedParents: Object.freeze([
    Object.freeze({ family: "ISSUER_EVIDENCE", missingAuthority: "event_issuer_mapping_authorities and structured issuer evidence members", disposition: "DESIGN_ONLY_NO_APPLIED_PARENT_NO_FK" }),
    Object.freeze({ family: "CORRECTION_LINEAGE", missingAuthority: "normalized event claims and correction lineage parents", disposition: "DESIGN_ONLY_NO_APPLIED_PARENT_NO_FK" }),
    Object.freeze({ family: "DISCOVERY_SOURCE_RECORD", missingAuthority: "NewsAPI, GDELT, issuer-release and exchange announcement source-record authorities", disposition: "NOT_APPLIED_NO_FK; sibling qualification contracts are not merged persistence" }),
    Object.freeze({ family: "DERIVED_COMPOSITION", missingAuthority: "queue composition snapshot parent", disposition: "NOT_APPLIED_DERIVED_REFERENCE_ONLY" }),
    Object.freeze({ family: "DERIVED_QUEUE_SET", missingAuthority: "sealed queue snapshot parent", disposition: "NOT_APPLIED_DERIVED_REFERENCE_ONLY" }),
    Object.freeze({ family: "DERIVED_VIEW_MODEL", missingAuthority: "safe view-model snapshot parent", disposition: "NOT_APPLIED_DERIVED_REFERENCE_ONLY" }),
  ]),
  memberPolicy: Object.freeze({
    parent: "A future snapshot provenance parent binds exact scope identity, evaluationAsOf, composition/routing/queue/view-model versions and material identities, candidate-set identity, and the typed manifest. Scope and provenance are separate; candidate source artifact IDs never enter scope identity.",
    memberFields: Object.freeze(["snapshotIdentity", "memberOrdinal", "candidateMaterialIdentity", "sourceFamilyTag", "familySpecificReference", "materialVariantIdentity", "receiptOrAvailabilityReferenceSeparate", "compositionBinding", "queueSetBinding", "viewModelBinding"]),
    ordering: "Canonical UTF-16 code-unit ordering by closed family tag then canonical family reference identity; exact count, unique members and contiguous ordinals. Input source type controls eligible families; caller seenFamilies cannot widen it.",
    sealing: "Every member is parent-bound to exact snapshotIdentity and exact scope; parent-before-members, exact count/digest and deferred commit-time contiguous ordinal/set seal are mandatory. Seal verifies membership completeness, order and digest only; it does not establish source identity, authority, truth or independence. Orphans, cross-snapshot/scope members, payload-binding mismatch, missing/extra/duplicate members or family-material collision reject the complete snapshot.",
    origin: "Provenance is not corroboration. Same bound issuer release across wire/IR/exchange/aggregator, SEC alternate delivery paths, and correction members do not create additional independent origins; mapping or persisted snapshot is never an origin.",
  }),
  correctionPolicy: "Append-only snapshot provenance selects the exact authenticated current claim/lineage available at evaluationAsOf. Future corrections are excluded; correction/retraction produces a new snapshot, never a new scope; original provenance remains; retraction is terminal for that cutoff's current view; correction does not add independent origin.",
  rightsAndMinimization: Object.freeze({ policy: "Keep exact typed references and bounded derived metadata; do not copy raw articles, SEC bytes, provider payload, credentials, or error material into the snapshot by default. Reference availability is not storage permission; reference, metadata, source-content, derived-payload, logs and backup retention are separate rights decisions.", approvals: Object.freeze(["SOURCE_ACQUISITION", "PROCESSING", "SOURCE_REFERENCE_STORAGE", "DERIVED_METADATA_STORAGE", "QUEUE_SNAPSHOT_STORAGE", "RETENTION", "DELETION", "REDISTRIBUTION", "COMMERCIAL_USE"]) }),
  productionBlockers: Object.freeze(["NO_APPROVED_REVIEW_UNIVERSE_AUTHORITY_OR_SCOPE_OWNER", "NO_APPLIED_ISSUER_EVIDENCE_PARENT", "NO_APPLIED_EVENT_CLAIM_OR_CORRECTION_LINEAGE_PARENT", "NO_APPLIED_DISCOVERY_SOURCE_RECORD_PARENTS", "NO_APPROVED_QUEUE_SNAPSHOT_SCHEMA_OR_RUNTIME", "NO_SOURCE_OR_DERIVED_STORAGE_RETENTION_DELETION_OR_RIGHTS_APPROVALS", "CURRENT_SELECTION_AND_READ_PATH_BLOCKED", "AUTHORITY_UPGRADE_UNSUPPORTED_SIGNAL_AND_TRADING_BLOCKED"]),
  references: Object.freeze([
    Object.freeze({ path: "supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql", claim: "Applied SEC profile, filing, artifact, package/member, receipt and lineage keys; immutable/RLS/revocation/seal definitions." }),
    Object.freeze({ path: "supabase/migrations/20260918215043_m5_raw_source_lineage.sql", claim: "Final applied eight-column M5 asset mapping key and child lineage indexes." }),
    Object.freeze({ path: "supabase/migrations/20260917012625_m5_source_lineage.sql", claim: "Applied M5 source-lineage composite key." }),
    Object.freeze({ path: "docs/EVENT_INTELLIGENCE_EVIDENCE_REVIEW_QUEUE_READ_MODEL_DECISION.md", claim: "Parent read-model strategy, authority boundary, applied-key correction and blockers." }),
    Object.freeze({ path: "docs/EVENT_INTELLIGENCE_PERSISTENCE_SCHEMA_UOW_DECISION.md", claim: "Design-only issuer/event persistence distinctions; not applied schema." }),
  ]),
  reviewedAt: "2026-10-03T00:00:00.000Z",
});

const INVALID = Object.freeze({ status: "INVALID" as const, reason: "SCOPE_PROVENANCE_DECISION_INVALID" as const });
const hex = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort((a,b) => a < b ? -1 : a > b ? 1 : 0).map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}
function hash(v: unknown): string { return createHash("sha256").update(`event-intelligence-evidence-review-queue-scope-provenance-decision/v1\0${canonical(v)}`, "utf8").digest("hex"); }
function freeze<T>(v: T): T { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const key of Reflect.ownKeys(v as object)) freeze((v as Record<PropertyKey, unknown>)[key]); Object.freeze(v); } return v; }
function safeShape(v: unknown, t: unknown, depth = 0): boolean {
  if (depth > EVIDENCE_QUEUE_SCOPE_PROVENANCE_LIMITS.maxDepth) return false;
  if (v === null || typeof v !== "object") {
    if (typeof t === "string") return typeof v === "string" && v.length > 0 && v.length <= EVIDENCE_QUEUE_SCOPE_PROVENANCE_LIMITS.maxString && !/[\p{Cc}\p{Cf}]/u.test(v);
    return typeof v === typeof t;
  }
  if (types.isProxy(v) || Object.getPrototypeOf(v) !== (Array.isArray(v) ? Array.prototype : Object.prototype)) return false;
  if (Array.isArray(t)) {
    if (!Array.isArray(v) || v.length !== t.length || Reflect.ownKeys(v).length !== v.length + 1) return false;
    for (let i=0;i<t.length;i++) { const d=Object.getOwnPropertyDescriptor(v,String(i)); if (!d || !("value" in d) || !d.enumerable || !safeShape(d.value,t[i],depth+1)) return false; }
    return true;
  }
  if (Array.isArray(v) || !t || typeof t !== "object") return false;
  const keys=Reflect.ownKeys(v), expected=Object.keys(t);
  if (keys.length!==expected.length || keys.some(k=>typeof k!=="string" || !expected.includes(k))) return false;
  for (const k of expected) { const d=Object.getOwnPropertyDescriptor(v,k); if (!d || !("value" in d) || !d.enumerable || !safeShape(d.value,(t as Record<string,unknown>)[k],depth+1)) return false; }
  return true;
}
function validTime(s: unknown): s is string { return typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString()===s; }
function clone(v: unknown): unknown { if (Array.isArray(v)) return v.map(clone); if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])); return v; }
function material(v: Record<string, unknown>): Record<string, unknown> { const x={...v}; delete x.decisionId; delete x.fingerprint; delete x.recordedAt; return x; }
export type ScopeProvenanceParse = Readonly<{ status: "VALID"; decision: EvidenceQueueScopeProvenanceDecision }> | typeof INVALID;

export function parseEvidenceQueueScopeProvenanceDecision(input: unknown): ScopeProvenanceParse {
  try {
    if (!input || typeof input !== "object" || types.isProxy(input)) return INVALID;
    const template={...BODY,decisionId:`event-queue-scope-provenance:${"a".repeat(64)}`,fingerprint:"a".repeat(64),recordedAt:"2000-01-01T00:00:00.000Z"};
    if (!safeShape(input,template)) return INVALID;
    const v=input as Record<string,unknown>, m=material(v), fp=hash(m);
    if (canonical(m)!==canonical(BODY) || !validTime(v.reviewedAt) || !validTime(v.recordedAt) || v.fingerprint!==fp || v.decisionId!==`event-queue-scope-provenance:${fp}` || !hex(v.fingerprint)) return INVALID;
    return Object.freeze({status:"VALID",decision:freeze(clone(v)) as EvidenceQueueScopeProvenanceDecision});
  } catch { return INVALID; }
}
export function getEvidenceQueueScopeProvenanceDecision(recordedAt: string): EvidenceQueueScopeProvenanceDecision {
  if (!validTime(recordedAt)) throw new Error("SCOPE_PROVENANCE_DECISION_INVALID");
  const fingerprint=hash(BODY), parsed=parseEvidenceQueueScopeProvenanceDecision({...BODY,decisionId:`event-queue-scope-provenance:${fingerprint}`,fingerprint,recordedAt});
  if (parsed.status!=="VALID") throw new Error("SCOPE_PROVENANCE_DECISION_INVALID"); return parsed.decision;
}

const REFERENCE_SCHEMAS: Readonly<Record<string, Readonly<{ schemaVersion: string; fields: Readonly<Record<string, string>> }>>> = Object.freeze({
  SEC_EVENT_DOCUMENT: Object.freeze({schemaVersion:"sec-event-document-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",targetKind:"enum:sec-target",key:"nested:sec-key"}) as never}),
  ISSUER_EVIDENCE: Object.freeze({schemaVersion:"issuer-evidence-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",issuerEvidenceContractVersion:"enum:version:event-intelligence-issuer-evidence/v1",evidenceMaterialIdentity:"sha256",sourceOriginBinding:"sha256"}) as never}),
  ASSET_MAPPING_REVISION: Object.freeze({schemaVersion:"m5-asset-mapping-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",mapping_revision_id:"string",source_lineage_id:"string",provider_id:"string",dataset_id:"string",dataset_version:"string",canonical_asset_id:"string",canonical_identifier:"string",asset_class:"string"}) as never}),
  DISCOVERY_SOURCE_RECORD: Object.freeze({schemaVersion:"discovery-source-record-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",sourceType:"enum:discovery-source",localCandidateIdentity:"sha256",materialVariantIdentity:"sha256",receiptIdentity:"sha256"}) as never}),
  CORRECTION_LINEAGE: Object.freeze({schemaVersion:"correction-lineage-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",lineageContractVersion:"enum:version:event-intelligence-correction-lineage/v1",rootClaimIdentity:"sha256",orderedMemberIdentities:"array:sha256",selectedTerminalIdentity:"sha256",evaluationAsOf:"timestamp"}) as never}),
  DERIVED_COMPOSITION: Object.freeze({schemaVersion:"derived-composition-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",compositionContractVersion:"enum:version:event-intelligence-evidence-review-queue-composition/v1",compositionMaterialIdentity:"sha256"}) as never}),
  DERIVED_QUEUE_SET: Object.freeze({schemaVersion:"derived-queue-set-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",queueContractVersion:"enum:version:event-intelligence-evidence-review-queue-contract/v1",queueSetMaterialIdentity:"sha256",sealedMemberSetIdentity:"sha256"}) as never}),
  DERIVED_VIEW_MODEL: Object.freeze({schemaVersion:"derived-view-model-reference/v1",fields:Object.freeze({family:"enum:family",schemaVersion:"string",viewModelContractVersion:"enum:version:event-intelligence-evidence-review-queue-view-model/v1",safePayloadDigest:"sha256",payloadLength:"ordinal"}) as never}),
});
const SEC_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  PROFILE:Object.freeze(["profile_id","fingerprint"]),
  FILING_IDENTITY:Object.freeze(["filing_identity_id","profile_id","profile_fingerprint","cik","accession_number","form"]),
  DOCUMENT_ARTIFACT:Object.freeze(["artifact_id","fingerprint"]),
  FILING_PACKAGE:Object.freeze(["package_id","fingerprint","filing_identity_id"]),
  PACKAGE_MEMBER:Object.freeze(["package_id","package_fingerprint","member_ordinal"]),
  ACQUISITION_RECEIPT:Object.freeze(["receipt_id","package_id","package_fingerprint"]),
  SOURCE_LINEAGE:Object.freeze(["lineage_id","fingerprint"]),
  LINEAGE_MEMBER:Object.freeze(["lineage_id","member_ordinal"]),
});
const REFERENCE_INVALID = Object.freeze({status:"INVALID" as const,reason:"PROVENANCE_REFERENCE_INVALID" as const});
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && !types.isProxy(v) && Object.getPrototypeOf(v) === Object.prototype;
function exactDataObject(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (!isRecord(v)) return false;
  const own=Reflect.ownKeys(v);
  if (own.length!==keys.length || own.some(k=>typeof k!=="string" || !keys.includes(k))) return false;
  return keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d && "value" in d && d.enumerable;});
}
const canonicalToken=(v: unknown, max=192): v is string => typeof v==="string" && v.length>0 && v.length<=max && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(v) && !/(?:https?:|www\.|api.?key|secret|bearer|credential|token)/i.test(v);
const digestToken=(v: unknown): v is string => typeof v==="string" && /^[0-9a-f]{64}$/.test(v);
function validSecKey(kind: unknown,key: unknown): boolean {
  if (typeof kind!=="string" || !Object.hasOwn(SEC_KEYS,kind)) return false;
  const keys=SEC_KEYS[kind]; if (!keys || !exactDataObject(key,keys)) return false;
  for (const name of keys) {
    const value=key[name];
    if (name==="member_ordinal") { if (!Number.isSafeInteger(value) || (value as number)<0 || (value as number)>32) return false; }
    else if (name==="fingerprint" || name==="profile_fingerprint" || name==="package_fingerprint") { if (!digestToken(value)) return false; }
    else if (name==="form") { if (value!=="8-K" && value!=="8-K/A") return false; }
    else if (!canonicalToken(value, name==="accession_number"?24:192)) return false;
  }
  return true;
}
/** Validates a closed family-tagged reference shape only; it never resolves parents or grants trust. */
export function parseEvidenceQueueProvenanceReference(input: unknown): EvidenceQueueProvenanceReferenceParse {
  try {
    if (!isRecord(input) || !Object.hasOwn(input,"family")) return REFERENCE_INVALID;
    const familyDescriptor=Object.getOwnPropertyDescriptor(input,"family");
    if (!familyDescriptor || !("value" in familyDescriptor) || typeof familyDescriptor.value!=="string") return REFERENCE_INVALID;
    const family=familyDescriptor.value, schema=REFERENCE_SCHEMAS[family];
    if (!schema) return REFERENCE_INVALID;
    if (family==="SEC_EVENT_DOCUMENT") {
      if (!exactDataObject(input,["family","schemaVersion","targetKind","key"]) || input.schemaVersion!==schema.schemaVersion || typeof input.targetKind!=="string" || !validSecKey(input.targetKind,input.key)) return REFERENCE_INVALID;
      const result=freeze({family,schemaVersion:schema.schemaVersion,targetKind:input.targetKind,key:clone(input.key)}) as EvidenceQueueProvenanceReference;
      return Object.freeze({status:"VALID_SYNTAX_ONLY",reference:result});
    }
    const fields=Object.keys(schema.fields), expected=fields;
    if (!exactDataObject(input,expected) || input.schemaVersion!==schema.schemaVersion || input.family!==family) return REFERENCE_INVALID;
    for (const [field,rule] of Object.entries(schema.fields)) {
      const value=input[field];
      if (rule==="enum:family") { if (value!==family) return REFERENCE_INVALID; }
      else if (rule.startsWith("enum:version:")) { if (value!==rule.slice("enum:version:".length)) return REFERENCE_INVALID; }
      else if (rule==="string") { if (!canonicalToken(value)) return REFERENCE_INVALID; }
      else if (rule==="sha256") { if (!digestToken(value)) return REFERENCE_INVALID; }
      else if (rule==="ordinal") { if (!Number.isSafeInteger(value) || (value as number)<1 || (value as number)>1_048_576) return REFERENCE_INVALID; }
      else if (rule==="enum:discovery-source") { if (typeof value!=="string" || !["NEWSAPI","GDELT","ISSUER_IR","ISSUER_WIRE","EXCHANGE_DISCLOSURE"].includes(value)) return REFERENCE_INVALID; }
      else if (rule==="array:sha256") {
        if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length<1 || value.length>64 || Reflect.ownKeys(value).length!==value.length+1) return REFERENCE_INVALID;
        const seen=new Set<string>();
        for (let i=0;i<value.length;i++) { const d=Object.getOwnPropertyDescriptor(value,String(i)); if (!d || !("value" in d) || !d.enumerable || !digestToken(d.value) || seen.has(d.value)) return REFERENCE_INVALID; seen.add(d.value); }
      } else if (rule==="timestamp") { if (typeof value!=="string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value) return REFERENCE_INVALID; }
    }
    return Object.freeze({status:"VALID_SYNTAX_ONLY",reference:freeze(clone(input)) as EvidenceQueueProvenanceReference});
  } catch { return REFERENCE_INVALID; }
}

export const EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG = freeze({
  contractVersion:EVIDENCE_QUEUE_SCOPE_PROVENANCE_CONFIG_VERSION, status:"BLOCKED", selectedScopeModel:null, selectedScopeAuthority:null,
  activeScopeRegistry:[], selectedProvenanceFamilies:[], appliedSupportedFamilies:["SEC_EVENT_DOCUMENT","ASSET_MAPPING_REVISION"],
  designOnlyFamilies:["CORRECTION_LINEAGE"], unsupportedFamilies:["ISSUER_EVIDENCE","DISCOVERY_SOURCE_RECORD"], derivedFamilies:["DERIVED_COMPOSITION","DERIVED_QUEUE_SET","DERIVED_VIEW_MODEL"],
  snapshotScopeReadiness:"BLOCKED", provenanceReadiness:"BLOCKED", persistence:"BLOCKED", readPath:"BLOCKED", currentSelection:"BLOCKED", authorityUpgrade:"UNSUPPORTED", signal:"BLOCKED", trading:"BLOCKED",
  approvals:{sourceAcquisition:"NOT_APPROVED",processing:"NOT_APPROVED",sourceReferenceStorage:"NOT_APPROVED",derivedMetadataStorage:"NOT_APPROVED",queueSnapshotStorage:"NOT_APPROVED",retention:"NOT_APPROVED",deletion:"NOT_APPROVED",redistribution:"NOT_APPROVED",commercialUse:"NOT_APPROVED"},
  blockers:BODY.productionBlockers,
});
export function getEvidenceQueueScopeProvenanceProductionConfig(): typeof EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG { return EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG; }
export function parseEvidenceQueueScopeProvenanceProductionConfig(input: unknown): typeof EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG | null {
  try { if (!input || typeof input!=="object" || types.isProxy(input) || !safeShape(input,EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG)) return null; if (canonical(input)!==canonical(EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG)) return null; return EVIDENCE_QUEUE_SCOPE_PROVENANCE_PRODUCTION_CONFIG; } catch { return null; }
}
