import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";

export const SOURCE_PORTFOLIO_DECISION_VERSION = "event-intelligence-source-portfolio-routing-decision/v1" as const;
export const SOURCE_FAMILIES = Object.freeze(["DISCOVERY_AGGREGATOR", "ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "FILING_AUTHORITY", "INDEPENDENT_FACTUAL_CORROBORATION"] as const);
export type SourceFamily = typeof SOURCE_FAMILIES[number];
export const ROUTING_STATES = Object.freeze(["DISCOVERED", "SOURCE_RETRIEVAL_REQUIRED", "ISSUER_MAPPING_REQUIRED", "ASSET_MAPPING_REQUIRED", "PRIMARY_DISCLOSURE_REQUIRED", "CORRECTION_REVIEW_REQUIRED", "CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED", "STOPPED_BLOCKED", "NON_AUTHORITATIVE_REVIEW_COMPLETE"] as const);
export type RoutingState = typeof ROUTING_STATES[number];
export const PORTFOLIO_REVIEW_PRIORITIES = Object.freeze(["URGENT_CORRECTION_REVIEW", "PRIMARY_SOURCE_MISSING", "MAPPING_REQUIRED", "ROUTINE_DISCOVERY_REVIEW", "BLOCKED_RIGHTS", "NO_ACTION_DUPLICATE"] as const);
export type PortfolioReviewPriority = typeof PORTFOLIO_REVIEW_PRIORITIES[number];
export const DEGRADATION_REASONS = Object.freeze(["PRIMARY_SOURCE_UNAVAILABLE", "SOURCE_QUALIFICATION_INCOMPLETE", "MAPPING_INCOMPLETE", "RIGHTS_UNAPPROVED", "CORRECTION_UNRESOLVED", "CONFLICTING_MATERIAL", "STALE_MATERIAL", "UNSUPPORTED_JURISDICTION", "INDEPENDENT_CORROBORATION_UNAVAILABLE", "CREDENTIAL_MISSING", "ACQUISITION_DISABLED", "DUPLICATE_MATERIAL"] as const);
export type DegradationReason = typeof DEGRADATION_REASONS[number];
export const EVENT_HINTS = Object.freeze(["PURCHASE_INTENT", "BOARD_AUTHORIZATION", "TREASURY_POLICY", "BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE", "CANCELLATION_TERMINATION", "CORRECTION_AMENDMENT", "RETRACTION_WITHDRAWAL", "UNRELATED_CORPORATE_ACTION", "UNKNOWN"] as const);
export type EventHint = typeof EVENT_HINTS[number];

const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const stable = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(stable).join(",")}]` : `{${Object.keys(v).sort(cmp).map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
const fail = (): never => { throw new Error("SOURCE_PORTFOLIO_DECISION_INVALID"); };
const safeId = (v: unknown): string => { if (typeof v !== "string" || !/^[a-z][a-z0-9:_-]{1,95}$/.test(v) || /(?:https?:|www\.|api[_-]?(?:key|token)|secret|credential|bearer)/i.test(v)) return fail(); return v; };
const OBJECT_INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !OBJECT_INTRINSICS.has(k))) return fail();
  const own = Reflect.ownKeys(value); if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const k of keys) { const d = Object.getOwnPropertyDescriptor(value, k); if (!d || !("value" in d) || !d.enumerable) return fail(); out[k] = d.value; }
  return out;
}
function safeSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 16) return fail();
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : fail();
  if (typeof value !== "object" || types.isProxy(value)) return fail();
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return fail();
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 512 || Reflect.ownKeys(value).length !== length + 1) return fail();
    const out: unknown[] = [];
    for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(safeSnapshot(d.value, depth + 1)); }
    return out;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !OBJECT_INTRINSICS.has(k))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const k of Reflect.ownKeys(value)) { if (typeof k !== "string") return fail(); const d = Object.getOwnPropertyDescriptor(value, k); if (!d || !("value" in d) || !d.enumerable) return fail(); out[k] = safeSnapshot(d.value, depth + 1); }
  return out;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > max || Reflect.ownKeys(value).length !== length + 1) return fail();
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(d.value); }
  return out;
}
function text(v: unknown, max = 256): string { if (typeof v !== "string" || !v || v.length > max || v.trim() !== v || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(v) || v.normalize("NFC") !== v) return fail(); return v; }
function uniqueIds(v: unknown, max = 64): string[] { const values = list(v, max).map(safeId); if (new Set(values).size !== values.length) return fail(); return values.sort(cmp); }
function enumValue<T extends readonly string[]>(v: unknown, allowed: T): T[number] { if (typeof v !== "string" || !allowed.includes(v)) return fail(); return v; }
function iso(v: unknown): string { if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) return fail(); return v; }

type Evidence = Readonly<{ referenceId: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN" }>;
type FamilyBudget = Readonly<{ family: SourceFamily; maxRequestsPerRun: number; maxBytes: number; maxRecords: number; timeoutMs: number; retries: 0; historicalBackfill: "BLOCKED"; concurrentAcquisitions: 0 }>;
export type SourcePortfolioDecision = Readonly<{
  contractVersion: typeof SOURCE_PORTFOLIO_DECISION_VERSION; decisionId: string; fingerprint: string; sourceFamilies: readonly SourceFamily[];
  sourceStrength: readonly string[]; jurisdictionRoutes: readonly Readonly<{ jurisdiction: string; order: readonly SourceFamily[]; unknownPolicy: "STOP_OR_DISCOVERY_ONLY" }>[];
  eventRoutes: readonly Readonly<{ hint: EventHint; required: RoutingState; completionEvidenceRequired: boolean; retractionStops: boolean }>[];
  routingStates: readonly RoutingState[]; transitions: readonly Readonly<{ from: RoutingState; to: RoutingState }>[];
  degradationReasons: readonly DegradationReason[]; conflictReasons: readonly string[]; originRules: readonly string[];
  operationalPriorities: readonly PortfolioReviewPriority[]; coverageDimensions: readonly string[]; budgets: readonly FamilyBudget[];
  requiredApprovals: readonly string[]; productionBlockers: readonly string[]; evidence: readonly Evidence[]; status: "DECISION_ONLY"; recordedAt: string;
}>;

const SOURCE_STRENGTH = Object.freeze(["DISCOVERY_ONLY", "ISSUER_ATTRIBUTED", "REGULATORY_PUBLICATION", "FILING_PUBLICATION", "INDEPENDENT_FACTUAL_VERIFICATION_UNSUPPORTED"]);
const CONFLICTS = Object.freeze(["ISSUER_IDENTITY_CONFLICT", "LISTING_JURISDICTION_CONFLICT", "ASSET_REPRESENTATION_CONFLICT", "AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT", "PUBLICATION_TIME_CONFLICT", "CORRECTION_LINEAGE_CONFLICT", "SOURCE_MATERIAL_CONFLICT", "AUTHORITY_TIER_CONFLICT", "ORIGIN_GROUP_CONFLICT"]);
const ORIGIN_RULES = Object.freeze(["SOURCE_RECORD_IS_NOT_A_SOURCE_ORIGIN", "RETRIEVAL_ARTIFACT_IS_NOT_AN_ORIGIN", "EXPLICIT_UPSTREAM_MATERIAL_BINDING_REQUIRED_TO_GROUP", "ISSUER_IR_AND_WIRE_COPY_OF_SAME_RELEASE_ARE_ONE_ISSUER_ORIGIN", "EXCHANGE_PAGE_AND_DOCUMENT_FOR_SAME_ANNOUNCEMENT_ARE_ONE_ORIGIN", "SEC_DELIVERY_PATHS_FOR_SAME_FILING_ARE_ONE_ORIGIN", "NEWSAPI_GDELT_AND_OTHER_AGGREGATOR_POINTERS_DO_NOT_CREATE_ORIGINS", "CORRECTIONS_AMENDMENTS_AND_RETRACTIONS_ARE_NOT_NEW_ORIGINS", "SIMILARITY_OR_LABELS_NEVER_PROVE_SAME_ORIGIN", "DISTINCT_ORIGINS_DO_NOT_AUTOMATICALLY_CORROBORATE"]);
const COVERAGE = Object.freeze(["JURISDICTION", "LISTED_UNLISTED_ISSUER", "FILING", "ISSUER_RELEASE", "LANGUAGE", "ARCHIVE_HORIZON", "LATENCY", "CORRECTION_AVAILABILITY", "PAYLOAD_SCHEMA_STABILITY"]);
const APPROVALS = Object.freeze(["ACQUISITION", "PROCESSING", "RAW_STORAGE", "METADATA_STORAGE", "NORMALIZED_STORAGE", "PERSISTENCE", "RETENTION", "REDISTRIBUTION", "COMMERCIAL_USE"]);
const BLOCKERS = Object.freeze(["SOURCE_REGISTRIES_EMPTY", "NO_ACQUISITION_APPROVAL", "NO_STORAGE_OR_RETENTION_APPROVAL", "NO_MAPPING_AUTHORITY", "NO_CORRECTION_LINEAGE_AUTHORITY", "INDEPENDENT_FACTUAL_CORROBORATION_UNSUPPORTED", "NO_EVENT_AUTHORITY_ISSUANCE", "NO_SIGNAL_OR_TRADING_HANDOFF"]);
const STATES = ROUTING_STATES;
const ALLOWED_TRANSITIONS: readonly { from: RoutingState; to: RoutingState }[] = Object.freeze([
  { from: "DISCOVERED", to: "SOURCE_RETRIEVAL_REQUIRED" }, { from: "DISCOVERED", to: "STOPPED_BLOCKED" },
  { from: "SOURCE_RETRIEVAL_REQUIRED", to: "ISSUER_MAPPING_REQUIRED" }, { from: "SOURCE_RETRIEVAL_REQUIRED", to: "STOPPED_BLOCKED" },
  { from: "ISSUER_MAPPING_REQUIRED", to: "ASSET_MAPPING_REQUIRED" }, { from: "ISSUER_MAPPING_REQUIRED", to: "STOPPED_BLOCKED" },
  { from: "ASSET_MAPPING_REQUIRED", to: "PRIMARY_DISCLOSURE_REQUIRED" }, { from: "ASSET_MAPPING_REQUIRED", to: "STOPPED_BLOCKED" },
  { from: "PRIMARY_DISCLOSURE_REQUIRED", to: "CORRECTION_REVIEW_REQUIRED" }, { from: "PRIMARY_DISCLOSURE_REQUIRED", to: "STOPPED_BLOCKED" },
  { from: "CORRECTION_REVIEW_REQUIRED", to: "CORROBORATION_REVIEW_REQUIRED" }, { from: "CORRECTION_REVIEW_REQUIRED", to: "STOPPED_BLOCKED" },
  { from: "CORROBORATION_REVIEW_REQUIRED", to: "ELIGIBILITY_REVIEW_REQUIRED" }, { from: "CORROBORATION_REVIEW_REQUIRED", to: "STOPPED_BLOCKED" },
  { from: "ELIGIBILITY_REVIEW_REQUIRED", to: "NON_AUTHORITATIVE_REVIEW_COMPLETE" }, { from: "ELIGIBILITY_REVIEW_REQUIRED", to: "STOPPED_BLOCKED" },
]);
const JURISDICTIONS: readonly { jurisdiction: string; order: readonly SourceFamily[]; unknownPolicy: "STOP_OR_DISCOVERY_ONLY" }[] = Object.freeze([
  { jurisdiction: "US_SEC", order: ["FILING_AUTHORITY", "ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "DISCOVERY_AGGREGATOR"], unknownPolicy: "STOP_OR_DISCOVERY_ONLY" },
  { jurisdiction: "GB_LSE", order: ["REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"], unknownPolicy: "STOP_OR_DISCOVERY_ONLY" },
  { jurisdiction: "AU_ASX", order: ["REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"], unknownPolicy: "STOP_OR_DISCOVERY_ONLY" },
  { jurisdiction: "UNLISTED", order: ["ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"], unknownPolicy: "STOP_OR_DISCOVERY_ONLY" },
  { jurisdiction: "UNKNOWN", order: ["DISCOVERY_AGGREGATOR"], unknownPolicy: "STOP_OR_DISCOVERY_ONLY" },
]);
const EVENT_ROUTE: readonly { hint: EventHint; required: RoutingState; completionEvidenceRequired: boolean; retractionStops: boolean }[] = Object.freeze(EVENT_HINTS.map(hint => ({ hint, required: hint === "CORRECTION_AMENDMENT" || hint === "RETRACTION_WITHDRAWAL" ? "CORRECTION_REVIEW_REQUIRED" as const : hint === "BINDING_AGREEMENT" || hint === "COMPLETED_PURCHASE" ? "PRIMARY_DISCLOSURE_REQUIRED" as const : "SOURCE_RETRIEVAL_REQUIRED" as const, completionEvidenceRequired: hint === "COMPLETED_PURCHASE", retractionStops: hint === "RETRACTION_WITHDRAWAL" })));
const BUDGETS = Object.freeze(SOURCE_FAMILIES.map(family => Object.freeze({ family, maxRequestsPerRun: family === "INDEPENDENT_FACTUAL_CORROBORATION" ? 0 : family === "DISCOVERY_AGGREGATOR" ? 2 : 1, maxBytes: family === "INDEPENDENT_FACTUAL_CORROBORATION" ? 0 : 524288, maxRecords: family === "INDEPENDENT_FACTUAL_CORROBORATION" ? 0 : 25, timeoutMs: family === "INDEPENDENT_FACTUAL_CORROBORATION" ? 0 : 5000, retries: 0 as const, historicalBackfill: "BLOCKED" as const, concurrentAcquisitions: 0 as const })));
const material = Object.freeze({ contractVersion: SOURCE_PORTFOLIO_DECISION_VERSION, decisionId: "event-intelligence-source-portfolio-routing-v1", sourceFamilies: SOURCE_FAMILIES, sourceStrength: SOURCE_STRENGTH, jurisdictionRoutes: JURISDICTIONS, eventRoutes: EVENT_ROUTE, routingStates: STATES, transitions: ALLOWED_TRANSITIONS, degradationReasons: DEGRADATION_REASONS, conflictReasons: CONFLICTS, originRules: ORIGIN_RULES, operationalPriorities: PORTFOLIO_REVIEW_PRIORITIES, coverageDimensions: COVERAGE, budgets: BUDGETS, requiredApprovals: APPROVALS, productionBlockers: BLOCKERS, evidence: Object.freeze([{ referenceId: "decision-contract:source-family-boundaries", classification: "INFERRED" as const }, { referenceId: "decision-contract:baseline-source-documents", classification: "DOCUMENTED" as const }]), status: "DECISION_ONLY" as const });
const TRUSTED_DECISIONS = new WeakSet<object>();
function deepFreeze<T>(v: T): T { if (v && typeof v === "object") { for (const x of Object.values(v as Record<string, unknown>)) deepFreeze(x); Object.freeze(v); } return v; }
const trustedDecision: SourcePortfolioDecision = deepFreeze({ ...material, fingerprint: hash(stable(material)), recordedAt: "2026-10-03T00:00:00.000Z" }); TRUSTED_DECISIONS.add(trustedDecision);
export function getSourcePortfolioDecision(): SourcePortfolioDecision { return trustedDecision; }
export function isAuthenticSourcePortfolioDecision(v: unknown): v is SourcePortfolioDecision { return !!v && typeof v === "object" && TRUSTED_DECISIONS.has(v); }

export type SourcePortfolioDecisionParse = Readonly<{ status: "VALID"; fingerprint: string; recordedAt: string }> | Readonly<{ status: "INVALID"; code: "SOURCE_PORTFOLIO_DECISION_INVALID" }>;
const INVALID_DECISION: SourcePortfolioDecisionParse = Object.freeze({ status: "INVALID", code: "SOURCE_PORTFOLIO_DECISION_INVALID" });
/** Validation never mints operational trust; the built-in reviewed decision is resolved separately. */
export function parseSourcePortfolioDecision(input: unknown): SourcePortfolioDecisionParse {
  try {
    const v = exact(input, ["contractVersion", "decisionId", "fingerprint", "sourceFamilies", "sourceStrength", "jurisdictionRoutes", "eventRoutes", "routingStates", "transitions", "degradationReasons", "conflictReasons", "originRules", "operationalPriorities", "coverageDimensions", "budgets", "requiredApprovals", "productionBlockers", "evidence", "status", "recordedAt"]);
    if (v.contractVersion !== SOURCE_PORTFOLIO_DECISION_VERSION || v.decisionId !== material.decisionId || v.status !== "DECISION_ONLY") return INVALID_DECISION;
    const suppliedMaterial: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(material)) suppliedMaterial[k] = safeSnapshot(v[k]);
    const fingerprint = hash(stable(suppliedMaterial));
    if (v.fingerprint !== fingerprint || fingerprint !== trustedDecision.fingerprint || stable(suppliedMaterial) !== stable(material)) return INVALID_DECISION;
    const recordedAt = iso(v.recordedAt);
    return Object.freeze({ status: "VALID", fingerprint, recordedAt });
  } catch { return INVALID_DECISION; }
}

export type SyntheticRoutingMaterial = Readonly<{
  provenance: "SYNTHETIC"; candidateId: string; jurisdiction: string; listingScopes: readonly string[]; eventHint: EventHint;
  seenFamilies: readonly SourceFamily[]; availableFamilies: readonly SourceFamily[];
  issuerMapped: boolean; assetMapped: boolean; duplicate: boolean; rightsApproved: boolean; credentialAvailable: boolean; completionMaterialPresent: boolean;
  primaryAvailable: boolean; qualificationComplete: boolean; correctionPresent: boolean; correctionResolved: boolean;
  retracted: boolean; conflicts: readonly string[]; stale: boolean; originBindings: readonly Readonly<{ sourceRecordId: string; retrievalArtifactId: string; publicationId: string; issuerOriginId: string | null; distributionCopyOf: string | null }>[];
  publicationAt: string; discoveredAt: string; receivedAt: string; correctionAvailableAt: string | null; evaluationAsOf: string;
}>;
export type RoutingEvaluation = Readonly<{ status: "NON_AUTHORITATIVE_ROUTING_RESULT"; candidateId: string; currentState: RoutingState; nextState: RoutingState; evaluationAsOf: string; sourceStrength: string; operationalPriority: PortfolioReviewPriority; nextSourceFamily: SourceFamily | null; publicationOriginGroupCount: number; independentFactualOriginGroups: 0; degradationReasons: readonly DegradationReason[]; conflictReasons: readonly string[]; independentFactualCorroboration: "UNSUPPORTED"; authorityIssued: false; persistenceAllowed: false; signalEligible: false; tradingEligible: false }>;
export type SyntheticRoutingParse = Readonly<{ status: "VALID"; material: SyntheticRoutingMaterial }> | Readonly<{ status: "INVALID"; code: "ROUTING_INPUT_INVALID" }>;
const INVALID_ROUTING: SyntheticRoutingParse = Object.freeze({ status: "INVALID", code: "ROUTING_INPUT_INVALID" });
const ROUTING_EVALUATION_TRUST = new WeakSet<object>();
const ROUTING_EVALUATION_BINDING = new WeakMap<object, Readonly<{ decisionFingerprint: string; candidateBinding: string }>>();
const ORIGIN_KEYS = ["sourceRecordId", "retrievalArtifactId", "publicationId", "issuerOriginId", "distributionCopyOf"] as const;
export function parseSyntheticRoutingMaterial(input: unknown): SyntheticRoutingParse {
  try {
    const v = exact(input, ["provenance", "candidateId", "jurisdiction", "listingScopes", "eventHint", "seenFamilies", "availableFamilies", "issuerMapped", "assetMapped", "duplicate", "rightsApproved", "credentialAvailable", "completionMaterialPresent", "primaryAvailable", "qualificationComplete", "correctionPresent", "correctionResolved", "retracted", "conflicts", "stale", "originBindings", "publicationAt", "discoveredAt", "receivedAt", "correctionAvailableAt", "evaluationAsOf"]);
    if (v.provenance !== "SYNTHETIC") return INVALID_ROUTING;
    const boolKeys = ["issuerMapped", "assetMapped", "duplicate", "rightsApproved", "credentialAvailable", "completionMaterialPresent", "primaryAvailable", "qualificationComplete", "correctionPresent", "correctionResolved", "retracted", "stale"] as const;
    if (boolKeys.some(k => typeof v[k] !== "boolean")) return INVALID_ROUTING;
    const juris = text(v.jurisdiction, 32); if (!/^(?:US_SEC|GB_LSE|AU_ASX|UNLISTED|UNKNOWN|DUAL_LISTED)$/.test(juris)) return INVALID_ROUTING;
    const scopes = uniqueIds(v.listingScopes);
    if ((juris === "US_SEC" && (scopes.length !== 1 || scopes[0] !== "listing:us-sec")) || (juris === "GB_LSE" && (scopes.length !== 1 || scopes[0] !== "listing:lse")) || (juris === "AU_ASX" && (scopes.length !== 1 || scopes[0] !== "listing:asx")) || (juris === "UNLISTED" && scopes.length !== 0) || (juris === "UNKNOWN" && scopes.length !== 0) || (juris === "DUAL_LISTED" && scopes.length < 2)) return INVALID_ROUTING;
    const families = (raw: unknown) => { const a = list(raw, SOURCE_FAMILIES.length).map(x => enumValue(x, SOURCE_FAMILIES)); if (new Set(a).size !== a.length || a.includes("INDEPENDENT_FACTUAL_CORROBORATION")) return fail(); return a.sort(cmp) as SourceFamily[]; };
    const conflicts = list(v.conflicts, CONFLICTS.length).map(x => enumValue(x, CONFLICTS)); if (new Set(conflicts).size !== conflicts.length) return INVALID_ROUTING;
    const bindings = list(v.originBindings, 128).map(raw => { const o = exact(raw, ORIGIN_KEYS); return { sourceRecordId: safeId(o.sourceRecordId), retrievalArtifactId: safeId(o.retrievalArtifactId), publicationId: safeId(o.publicationId), issuerOriginId: o.issuerOriginId === null ? null : safeId(o.issuerOriginId), distributionCopyOf: o.distributionCopyOf === null ? null : safeId(o.distributionCopyOf) }; });
    const recordIds = bindings.map(x => x.sourceRecordId); if (new Set(recordIds).size !== recordIds.length) return INVALID_ROUTING;
    const byRecord = new Map(bindings.map(x => [x.sourceRecordId, x])); const publicationOrigins = new Map<string, string | null>();
    for (const b of bindings) { if (publicationOrigins.has(b.publicationId) && publicationOrigins.get(b.publicationId) !== b.issuerOriginId) return INVALID_ROUTING; publicationOrigins.set(b.publicationId, b.issuerOriginId); if (b.distributionCopyOf !== null) { const parent = byRecord.get(b.distributionCopyOf); if (!parent || parent.sourceRecordId === b.sourceRecordId || parent.publicationId !== b.publicationId || !b.issuerOriginId || parent.issuerOriginId !== b.issuerOriginId) return INVALID_ROUTING; } }
    for (const b of bindings) { const seen = new Set<string>(); let current: typeof b | undefined = b; while (current?.distributionCopyOf) { if (seen.has(current.sourceRecordId)) return INVALID_ROUTING; seen.add(current.sourceRecordId); current = byRecord.get(current.distributionCopyOf); } }
    const correctionAvailableAt = v.correctionAvailableAt === null ? null : iso(v.correctionAvailableAt);
    const seenFamilies = families(v.seenFamilies); const availableFamilies = families(v.availableFamilies);
    if (seenFamilies.some(f => availableFamilies.includes(f))) return INVALID_ROUTING;
    const evaluationAsOf = iso(v.evaluationAsOf); const publicationAt = iso(v.publicationAt); const discoveredAt = iso(v.discoveredAt); const receivedAt = iso(v.receivedAt);
    if (!(publicationAt <= discoveredAt && discoveredAt <= receivedAt && receivedAt <= evaluationAsOf) || (correctionAvailableAt !== null && (correctionAvailableAt < publicationAt || correctionAvailableAt > evaluationAsOf || !v.correctionPresent))) return INVALID_ROUTING;
    const out: SyntheticRoutingMaterial = { provenance: "SYNTHETIC", candidateId: safeId(v.candidateId), jurisdiction: juris, listingScopes: scopes, eventHint: enumValue(v.eventHint, EVENT_HINTS), seenFamilies, availableFamilies, issuerMapped: v.issuerMapped as boolean, assetMapped: v.assetMapped as boolean, duplicate: v.duplicate as boolean, rightsApproved: v.rightsApproved as boolean, credentialAvailable: v.credentialAvailable as boolean, completionMaterialPresent: v.completionMaterialPresent as boolean, primaryAvailable: v.primaryAvailable as boolean, qualificationComplete: v.qualificationComplete as boolean, correctionPresent: v.correctionPresent as boolean, correctionResolved: v.correctionResolved as boolean, retracted: v.retracted as boolean, conflicts: conflicts.sort(cmp), stale: v.stale as boolean, originBindings: bindings, publicationAt, discoveredAt, receivedAt, correctionAvailableAt, evaluationAsOf };
    return Object.freeze({ status: "VALID", material: deepFreeze(out) });
  } catch { return INVALID_ROUTING; }
}
function routeOrder(jurisdiction: string): readonly SourceFamily[] { return JURISDICTIONS.find(x => x.jurisdiction === jurisdiction)?.order as readonly SourceFamily[] ?? ["DISCOVERY_AGGREGATOR"]; }
function nextFamily(input: SyntheticRoutingMaterial): SourceFamily | null { return routeOrder(input.jurisdiction).find(f => !input.seenFamilies.includes(f) && input.availableFamilies.includes(f)) ?? null; }
function explicitNext(state: RoutingState): RoutingState { const t = ALLOWED_TRANSITIONS.find(x => x.from === state && x.to !== "STOPPED_BLOCKED"); return (t?.to as RoutingState | undefined) ?? "STOPPED_BLOCKED"; }
function candidateBinding(m: SyntheticRoutingMaterial): string { return stable({ candidateId: m.candidateId, jurisdiction: m.jurisdiction, listingScopes: m.listingScopes, eventHint: m.eventHint, originBindings: m.originBindings, publicationAt: m.publicationAt, discoveredAt: m.discoveredAt, receivedAt: m.receivedAt, correctionAvailableAt: m.correctionAvailableAt, evaluationAsOf: m.evaluationAsOf }); }
export function evaluateSourcePortfolioRouting(decision: unknown, input: unknown, previousResult?: unknown): RoutingEvaluation | null {
  if (!isAuthenticSourcePortfolioDecision(decision)) return null;
  const parsed = parseSyntheticRoutingMaterial(input); if (parsed.status !== "VALID") return null;
  const m = parsed.material;
  let currentState: RoutingState = "DISCOVERED";
  if (previousResult !== undefined) {
    if (!previousResult || typeof previousResult !== "object" || !ROUTING_EVALUATION_TRUST.has(previousResult)) return null;
    const binding = ROUTING_EVALUATION_BINDING.get(previousResult);
    if (!binding || binding.decisionFingerprint !== trustedDecision.fingerprint || binding.candidateBinding !== candidateBinding(m)) return null;
    const prior = previousResult as RoutingEvaluation;
    if (prior.nextState === "STOPPED_BLOCKED" || prior.nextState === "NON_AUTHORITATIVE_REVIEW_COMPLETE") return null;
    currentState = prior.nextState;
  }
  const conflicts = [...m.conflicts].sort(cmp); const degraded = new Set<DegradationReason>(["ACQUISITION_DISABLED"]);
  const preferredSource = routeOrder(m.jurisdiction)[0];
  if (m.duplicate) degraded.add("DUPLICATE_MATERIAL");
  if (!m.rightsApproved) degraded.add("RIGHTS_UNAPPROVED");
  if (!m.credentialAvailable) degraded.add("CREDENTIAL_MISSING");
  if (!m.qualificationComplete) degraded.add("SOURCE_QUALIFICATION_INCOMPLETE");
  if (!m.issuerMapped || !m.assetMapped) degraded.add("MAPPING_INCOMPLETE");
  if (!m.primaryAvailable) degraded.add("PRIMARY_SOURCE_UNAVAILABLE");
  if (preferredSource && !m.seenFamilies.includes(preferredSource) && !m.availableFamilies.includes(preferredSource)) degraded.add("PRIMARY_SOURCE_UNAVAILABLE");
  if (m.correctionPresent && !m.correctionResolved) degraded.add("CORRECTION_UNRESOLVED");
  if (m.stale) degraded.add("STALE_MATERIAL");
  if (m.jurisdiction === "UNKNOWN" || m.jurisdiction === "DUAL_LISTED") degraded.add("UNSUPPORTED_JURISDICTION");
  if (conflicts.length) degraded.add("CONFLICTING_MATERIAL");
  if (m.eventHint === "COMPLETED_PURCHASE" && (!m.completionMaterialPresent || (!m.seenFamilies.includes("FILING_AUTHORITY") && !m.seenFamilies.includes("REGULATORY_OR_EXCHANGE_DISCLOSURE")))) degraded.add("PRIMARY_SOURCE_UNAVAILABLE");
  if (m.eventHint === "RETRACTION_WITHDRAWAL" || m.retracted) degraded.add("CORRECTION_UNRESOLVED");
  const primaryNeeded = ["BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE", "CORRECTION_AMENDMENT", "RETRACTION_WITHDRAWAL"].includes(m.eventHint);
  let nextState: RoutingState = explicitNext(currentState);
  if (m.retracted || conflicts.length || !m.rightsApproved || !m.credentialAvailable || (m.correctionPresent && !m.correctionResolved) || m.jurisdiction === "DUAL_LISTED") nextState = "STOPPED_BLOCKED";
  else if (m.duplicate) nextState = "STOPPED_BLOCKED";
  else if (currentState === "DISCOVERED") nextState = "SOURCE_RETRIEVAL_REQUIRED";
  else if (currentState === "SOURCE_RETRIEVAL_REQUIRED" && (!m.qualificationComplete || !m.primaryAvailable || m.seenFamilies.length === 0)) nextState = "STOPPED_BLOCKED";
  else if (currentState === "SOURCE_RETRIEVAL_REQUIRED") nextState = "ISSUER_MAPPING_REQUIRED";
  else if (currentState === "ISSUER_MAPPING_REQUIRED" && (!m.qualificationComplete || !m.primaryAvailable || m.seenFamilies.length === 0 || !m.issuerMapped)) nextState = "STOPPED_BLOCKED";
  else if (currentState === "ISSUER_MAPPING_REQUIRED") nextState = "ASSET_MAPPING_REQUIRED";
  else if (currentState === "ASSET_MAPPING_REQUIRED" && (!m.assetMapped || !m.issuerMapped)) nextState = "STOPPED_BLOCKED";
  else if (currentState === "ASSET_MAPPING_REQUIRED") nextState = "PRIMARY_DISCLOSURE_REQUIRED";
  else if (currentState === "PRIMARY_DISCLOSURE_REQUIRED" && (!m.issuerMapped || !m.assetMapped || !m.primaryAvailable || !m.seenFamilies.some(f => f !== "DISCOVERY_AGGREGATOR"))) nextState = "STOPPED_BLOCKED";
  else if (currentState === "PRIMARY_DISCLOSURE_REQUIRED" && m.eventHint === "COMPLETED_PURCHASE" && !m.completionMaterialPresent) nextState = "STOPPED_BLOCKED";
  else if (currentState === "PRIMARY_DISCLOSURE_REQUIRED" && (primaryNeeded || !m.primaryAvailable)) nextState = m.primaryAvailable ? "CORRECTION_REVIEW_REQUIRED" : "STOPPED_BLOCKED";
  else if (currentState === "PRIMARY_DISCLOSURE_REQUIRED") nextState = "CORRECTION_REVIEW_REQUIRED";
  else if (currentState === "CORRECTION_REVIEW_REQUIRED" && (!m.issuerMapped || !m.assetMapped || !m.seenFamilies.some(f => f !== "DISCOVERY_AGGREGATOR"))) nextState = "STOPPED_BLOCKED";
  else if (currentState === "CORRECTION_REVIEW_REQUIRED" && ((m.correctionPresent && !m.correctionResolved) || m.eventHint === "CORRECTION_AMENDMENT" && !m.correctionResolved)) nextState = "STOPPED_BLOCKED";
  else if (currentState === "CORRECTION_REVIEW_REQUIRED") nextState = "CORROBORATION_REVIEW_REQUIRED";
  else if (currentState === "CORROBORATION_REVIEW_REQUIRED") nextState = "ELIGIBILITY_REVIEW_REQUIRED";
  else if (currentState === "ELIGIBILITY_REVIEW_REQUIRED") nextState = "NON_AUTHORITATIVE_REVIEW_COMPLETE";
  if ((m.jurisdiction === "UNKNOWN" || m.jurisdiction === "DUAL_LISTED") && currentState !== "DISCOVERED") nextState = "STOPPED_BLOCKED";
  if (nextState !== currentState && !ALLOWED_TRANSITIONS.some(t => t.from === currentState && t.to === nextState)) nextState = "STOPPED_BLOCKED";
  const strength = m.seenFamilies.includes("FILING_AUTHORITY") ? "FILING_PUBLICATION" : m.seenFamilies.includes("REGULATORY_OR_EXCHANGE_DISCLOSURE") ? "REGULATORY_PUBLICATION" : m.seenFamilies.includes("ISSUER_ATTRIBUTED_RELEASE") ? "ISSUER_ATTRIBUTED" : "DISCOVERY_ONLY";
  const priority: PortfolioReviewPriority = m.duplicate ? "NO_ACTION_DUPLICATE" : m.retracted || m.correctionPresent ? "URGENT_CORRECTION_REVIEW" : !m.rightsApproved ? "BLOCKED_RIGHTS" : !m.primaryAvailable || (!!preferredSource && !m.seenFamilies.includes(preferredSource) && !m.availableFamilies.includes(preferredSource)) ? "PRIMARY_SOURCE_MISSING" : (!m.issuerMapped || !m.assetMapped) ? "MAPPING_REQUIRED" : "ROUTINE_DISCOVERY_REVIEW";
  if (m.jurisdiction === "UNKNOWN") degraded.add("UNSUPPORTED_JURISDICTION");
  if (nextState === "CORROBORATION_REVIEW_REQUIRED" || nextState === "ELIGIBILITY_REVIEW_REQUIRED" || nextState === "NON_AUTHORITATIVE_REVIEW_COMPLETE") degraded.add("INDEPENDENT_CORROBORATION_UNAVAILABLE");
  const publicationGroups = new Set(m.originBindings.filter(x => x.issuerOriginId !== null).map(x => x.issuerOriginId!));
  const result = deepFreeze({ status: "NON_AUTHORITATIVE_ROUTING_RESULT" as const, candidateId: m.candidateId, currentState, nextState, evaluationAsOf: m.evaluationAsOf, sourceStrength: strength, operationalPriority: priority, nextSourceFamily: nextFamily(m), publicationOriginGroupCount: publicationGroups.size, independentFactualOriginGroups: 0 as const, degradationReasons: [...degraded].sort(cmp), conflictReasons: conflicts, independentFactualCorroboration: "UNSUPPORTED" as const, authorityIssued: false as const, persistenceAllowed: false as const, signalEligible: false as const, tradingEligible: false as const });
  ROUTING_EVALUATION_TRUST.add(result);
  ROUTING_EVALUATION_BINDING.set(result, Object.freeze({ decisionFingerprint: trustedDecision.fingerprint, candidateBinding: candidateBinding(m) }));
  return result;
}

export const SOURCE_PORTFOLIO_PRODUCTION_CONFIG = deepFreeze({ contractVersion: "event-intelligence-source-portfolio-routing-production/v1", selectedSourcePortfolio: null, activeRoutes: [], credentialReferences: [], scheduler: "BLOCKED", acquisition: "BLOCKED", sourceRetrieval: "BLOCKED", rawStorage: "BLOCKED", normalizedStorage: "BLOCKED", persistence: "BLOCKED", mapping: "BLOCKED", correctionResolution: "BLOCKED", corroboration: "BLOCKED", eventAuthority: "BLOCKED", signal: "BLOCKED", trading: "BLOCKED", approvals: Object.fromEntries(APPROVALS.map(x => [x, "NOT_APPROVED"])) });
