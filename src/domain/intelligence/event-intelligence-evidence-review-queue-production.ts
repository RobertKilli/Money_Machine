import "server-only";
import config from "../../../config/intelligence/event-intelligence-evidence-review-queue.production.json";
import { types } from "node:util";

const FIELDS = ["contractVersion", "selectedPortfolio", "activeQueuePolicies", "credentialReferences", "persistenceTargets", "notificationTargets", "reviewerIdentities", "queueProjection", "queuePersistence", "queueScheduler", "notifications", "reviewerAssignment", "sourceAcquisition", "eventAuthority", "signal", "trading", "approvals"] as const;
const APPROVAL_KEYS = ["ACQUISITION", "PROCESSING", "RAW_STORAGE", "METADATA_STORAGE", "NORMALIZED_STORAGE", "PERSISTENCE", "RETENTION", "REDISTRIBUTION", "COMMERCIAL_USE"] as const;
const objectIntrinsicKeys = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(k => typeof k !== "string" || !objectIntrinsicKeys.has(k))) throw new Error("INVALID");
  const own = Reflect.ownKeys(value); if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) throw new Error("INVALID");
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("INVALID"); out[key] = descriptor.value; }
  return out;
}
function emptyPlainArray(value: unknown): boolean { return Array.isArray(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === Array.prototype && Object.getOwnPropertyDescriptor(value, "length")?.value === 0 && Reflect.ownKeys(value).length === 1; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }
export function parseEvidenceReviewQueueProductionConfig(value: unknown): Readonly<Record<string, unknown>> | null {
  try {
    const input = exact(value, FIELDS);
    if (input.contractVersion !== "event-intelligence-evidence-review-queue-production/v1" || input.selectedPortfolio !== null || !emptyPlainArray(input.activeQueuePolicies) || !emptyPlainArray(input.credentialReferences) || !emptyPlainArray(input.persistenceTargets) || !emptyPlainArray(input.notificationTargets) || !emptyPlainArray(input.reviewerIdentities)) return null;
    for (const key of FIELDS.slice(7, 16)) if (input[key] !== "BLOCKED") return null;
    const approvals = exact(input.approvals, APPROVAL_KEYS);
    for (const key of APPROVAL_KEYS) if (approvals[key] !== "NOT_APPROVED") return null;
    return deepFreeze({ ...input, activeQueuePolicies: [], credentialReferences: [], persistenceTargets: [], notificationTargets: [], reviewerIdentities: [], approvals: { ...approvals } });
  } catch { return null; }
}
const parsed = parseEvidenceReviewQueueProductionConfig(config);
if (!parsed) throw new Error("EVIDENCE_REVIEW_QUEUE_PRODUCTION_CONFIG_INVALID");
export const EVIDENCE_REVIEW_QUEUE_PRODUCTION_CONFIG = parsed;
