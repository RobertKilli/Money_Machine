import "server-only";

import { types } from "node:util";
import productionConfig from "../../../config/intelligence/event-intelligence-evidence-review-queue-composition-policy-application.production.json";
import { EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION } from "../../application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  buildEvidenceReviewQueueScopeIdentity,
  verifyEvidenceReviewQueueScopeIdentity,
  type EvidenceQueueScopeMaterial,
} from "./event-intelligence-evidence-review-queue-scope-identity";

export const COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION =
  "event-intelligence-evidence-review-queue-composition-policy-application-evidence/v1" as const;
export const COMPOSITION_POLICY_APPLICATION_CONFIG_VERSION =
  "event-intelligence-evidence-review-queue-composition-policy-application-production/v1" as const;

export type CompositionPolicyApplicationEvidence = Readonly<{
  contractVersion: typeof COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION;
  scopeIdentity: string;
  expectedScopeMaterial: EvidenceQueueScopeMaterial;
  declaredAppliedScopeMaterial: EvidenceQueueScopeMaterial;
  evaluation: Readonly<{
    compositionContractVersion: typeof EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION;
    evaluationAsOf: string;
    resultBinding: "MISSING_RUNTIME_RESULT_BINDING";
  }>;
}>;

export type CompositionPolicyApplicationEvidenceParse =
  | Readonly<{ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE"; evidence: CompositionPolicyApplicationEvidence }>
  | Readonly<{ status: "INVALID"; code: "COMPOSITION_POLICY_APPLICATION_EVIDENCE_INVALID" }>;

const INVALID_EVIDENCE = Object.freeze({ status: "INVALID", code: "COMPOSITION_POLICY_APPLICATION_EVIDENCE_INVALID" }) as CompositionPolicyApplicationEvidenceParse;
const INVALID_CONFIG = Object.freeze({ status: "INVALID", code: "COMPOSITION_POLICY_APPLICATION_CONFIG_INVALID" });
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);

type WalkState = { nodes: number; ancestors: WeakSet<object> };
function clonePlain(value: unknown, state: WalkState, depth = 0): unknown {
  if (++state.nodes > 1_024 || depth > 8) throw new Error("INVALID");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 256 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error("INVALID");
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(i + 1); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("INVALID"); i++; }
      else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("INVALID");
    }
    return value;
  }
  if (typeof value !== "object" || types.isProxy(value)) throw new Error("INVALID");
  if (state.ancestors.has(value)) throw new Error("INVALID");
  state.ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("INVALID");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 64 || Reflect.ownKeys(value).length !== length + 1) throw new Error("INVALID");
    const output: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
      output.push(clonePlain(descriptor.value, state, depth + 1));
    }
    state.ancestors.delete(value);
    return output;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) throw new Error("INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.length > 24) throw new Error("INVALID");
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID");
    output[key] = clonePlain(descriptor.value, state, depth + 1);
  }
  state.ancestors.delete(value);
  return output;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
      if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}

const BLOCKED_CONFIG = deepFreeze({
  contractVersion: COMPOSITION_POLICY_APPLICATION_CONFIG_VERSION,
  applicationEvidenceActivation: "BLOCKED",
  selectedApplicationStrategy: null,
  selectedProducer: null,
  selectedAuthorityStrategy: null,
  activeApplicationRegistry: [],
  activeScopeRegistry: [],
  activeProducerRegistry: [],
  activeProvenanceRegistry: [],
  approvals: { applicationEvidence: "NOT_APPROVED", policyContent: "NOT_APPROVED", producer: "NOT_APPROVED", sourceAcquisition: "NOT_APPROVED", processing: "NOT_APPROVED", rights: "NOT_APPROVED", rawAndReferenceStorage: "NOT_APPROVED", derivedStorage: "NOT_APPROVED", retention: "NOT_APPROVED", deletion: "NOT_APPROVED", redistribution: "NOT_APPROVED", commercialUse: "NOT_APPROVED", accessAuthorization: "NOT_APPROVED" },
  producerActivation: "BLOCKED",
  persistence: "BLOCKED",
  readPath: "BLOCKED",
  currentSelection: "BLOCKED",
  authorityUpgrade: "UNSUPPORTED",
  signal: "BLOCKED",
  trading: "BLOCKED",
});

export type CompositionPolicyApplicationProductionConfig = typeof BLOCKED_CONFIG;
export type CompositionPolicyApplicationProductionConfigParse =
  | Readonly<{ status: "VALID_BLOCKED"; config: CompositionPolicyApplicationProductionConfig }>
  | typeof INVALID_CONFIG;

export const COMPOSITION_POLICY_APPLICATION_PRODUCTION_CONFIG = BLOCKED_CONFIG;

/** Syntax-checks a declaration against an explicit scope. This does not prove application or authenticity. */
export function parseCompositionPolicyApplicationEvidence(input: unknown): CompositionPolicyApplicationEvidenceParse {
  try {
    const cloned = clonePlain(input, { nodes: 0, ancestors: new WeakSet() }) as Record<string, unknown>;
    if (!cloned || Array.isArray(cloned) || Object.keys(cloned).sort().join("|") !== "contractVersion|declaredAppliedScopeMaterial|evaluation|expectedScopeMaterial|scopeIdentity") return INVALID_EVIDENCE;
    if (cloned.contractVersion !== COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION || typeof cloned.scopeIdentity !== "string") return INVALID_EVIDENCE;
    const expected = buildEvidenceReviewQueueScopeIdentity(cloned.expectedScopeMaterial);
    const declared = buildEvidenceReviewQueueScopeIdentity(cloned.declaredAppliedScopeMaterial);
    if (expected.status !== "VALID_SYNTAX_ONLY" || declared.status !== "VALID_SYNTAX_ONLY") return INVALID_EVIDENCE;
    const verifiedScope = verifyEvidenceReviewQueueScopeIdentity(expected.scopeMaterial, cloned.scopeIdentity);
    if (verifiedScope.status !== "IDENTITY_MATCHES_SYNTACTIC_MATERIAL" || expected.canonicalMaterial !== declared.canonicalMaterial) return INVALID_EVIDENCE;
    const evaluation = cloned.evaluation as Record<string, unknown>;
    if (!evaluation || Array.isArray(evaluation) || Object.keys(evaluation).sort().join("|") !== "compositionContractVersion|evaluationAsOf|resultBinding") return INVALID_EVIDENCE;
    if (evaluation.compositionContractVersion !== EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION || typeof evaluation.evaluationAsOf !== "string" || !UTC.test(evaluation.evaluationAsOf) || !Number.isFinite(Date.parse(evaluation.evaluationAsOf)) || new Date(evaluation.evaluationAsOf).toISOString() !== evaluation.evaluationAsOf || evaluation.resultBinding !== "MISSING_RUNTIME_RESULT_BINDING") return INVALID_EVIDENCE;
    const evidence = deepFreeze({
      contractVersion: COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION,
      scopeIdentity: expected.identity,
      expectedScopeMaterial: expected.scopeMaterial,
      declaredAppliedScopeMaterial: declared.scopeMaterial,
      evaluation: {
        compositionContractVersion: EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION,
        evaluationAsOf: evaluation.evaluationAsOf,
        resultBinding: "MISSING_RUNTIME_RESULT_BINDING" as const,
      },
    });
    return Object.freeze({ status: "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE" as const, evidence });
  } catch { return INVALID_EVIDENCE; }
}

/** Accepts only a fixed hard-blocked config; this parser cannot activate policy application. */
export function parseCompositionPolicyApplicationProductionConfig(input: unknown): CompositionPolicyApplicationProductionConfigParse {
  try {
    const cloned = clonePlain(input, { nodes: 0, ancestors: new WeakSet() });
    if (canonical(cloned) !== canonical(BLOCKED_CONFIG) || canonical(cloned) !== canonical(productionConfig)) return INVALID_CONFIG;
    return Object.freeze({ status: "VALID_BLOCKED" as const, config: BLOCKED_CONFIG });
  } catch { return INVALID_CONFIG; }
}

const configured = parseCompositionPolicyApplicationProductionConfig(productionConfig);
if (configured.status !== "VALID_BLOCKED") throw new Error("COMPOSITION_POLICY_APPLICATION_CONFIG_INVALID");
