import { createHash } from "node:crypto";
import { M5_PROVIDER_USAGES, type M5ProviderUsage } from "./m5-provider-readiness";

export const M5_PROVIDER_APPROVAL_AUTHORITY_VERSION = "m5-provider-approval-authority/v1" as const;
export const M5_PROVIDER_APPROVAL_POLICY_VERSION = "m5-provider-approval-policy/v1" as const;
export type M5ProviderApprovalDecision = "APPROVED" | "DENIED" | "REQUIRES_APPROVAL" | "UNKNOWN";
export type M5ProviderApprovalReference = Readonly<{ kind: "IDENTIFIER" | "SHA256"; value: string }>;
export type M5ProviderUsageApproval = Readonly<{ usage: M5ProviderUsage; decision: M5ProviderApprovalDecision; evidence: readonly M5ProviderApprovalReference[] }>;
export type M5ProviderRetentionDecision = Readonly<{ decision: M5ProviderApprovalDecision; evidence: readonly M5ProviderApprovalReference[] }>;
export type M5ProviderApprovalAuthority = Readonly<{
  contractVersion: typeof M5_PROVIDER_APPROVAL_AUTHORITY_VERSION;
  policyVersion: typeof M5_PROVIDER_APPROVAL_POLICY_VERSION;
  authorityVersion: string;
  approvalAuthorityId: string;
  approvalAuthorityFingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt?: string;
  recordedAt: string;
  usageDecisions: readonly M5ProviderUsageApproval[];
  retentionDecision: M5ProviderRetentionDecision;
}>;

const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const idPattern = /^[a-z0-9][a-z0-9._:/-]{0,255}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const badText = /(?:https?:\/\/|[?#]|api[-_]?key|authorization|cookie|credential|password|secret|token|private[-_]?key|email|phone|address|raw[-_]?payload|terms[-_]?text)/i;
const hostLike = /(?:^|\/)(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|$)/i;
const material = (a: Omit<M5ProviderApprovalAuthority, "approvalAuthorityId" | "approvalAuthorityFingerprint" | "recordedAt">) => a;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
function fail(code: string): never { throw new Error(code); }
function dataTree(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) fail("M5_APPROVAL_CYCLIC_VALUE");
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length) fail("M5_APPROVAL_SYMBOL_FIELD");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail("M5_APPROVAL_ARRAY_SHAPE_INVALID");
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || names.some(k => k !== "length" && (!/^(0|[1-9]\d*)$/.test(k) || Number(k) >= value.length))) fail("M5_APPROVAL_ARRAY_SHAPE_INVALID");
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !d.enumerable || !("value" in d)) fail("M5_APPROVAL_ACCESSOR_REJECTED");
      dataTree(d.value, seen);
    }
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail("M5_APPROVAL_NON_PLAIN_OBJECT");
  for (const key of Object.getOwnPropertyNames(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (!d.enumerable || !("value" in d)) fail("M5_APPROVAL_ACCESSOR_REJECTED");
    dataTree(d.value, seen);
  }
}
function exact(row: Record<string, unknown>, fields: readonly string[]): void {
  for (const key of fields) if (key in row && !Object.hasOwn(row, key)) fail("M5_APPROVAL_INHERITED_FIELD");
  for (const key of Object.keys(row)) if (!fields.includes(key)) fail(/secret|token|credential|authorization|cookie|private[-_]?key|api[-_]?key|password/i.test(key) ? "M5_APPROVAL_SECRET_FIELD" : "M5_APPROVAL_UNKNOWN_FIELD");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("M5_APPROVAL_OBJECT_INVALID");
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern: RegExp = idPattern): string {
  if (typeof value !== "string" || value.trim() !== value || !pattern.test(value) || badText.test(value) || hostLike.test(value)) fail("M5_APPROVAL_TEXT_INVALID");
  return value;
}
function time(value: unknown): string {
  if (typeof value !== "string" || !timePattern.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("M5_APPROVAL_TIMESTAMP_INVALID");
  return value;
}
function parseEvidence(value: unknown): readonly M5ProviderApprovalReference[] {
  if (!Array.isArray(value)) fail("M5_APPROVAL_EVIDENCE_INVALID");
  const rows = value.map(item => {
    const row = record(item); exact(row, ["kind", "value"]);
    if (row.kind === "IDENTIFIER" && typeof row.value === "string" && /^(?:review|evidence)\/[a-z0-9._/-]{1,240}$/.test(row.value) && !badText.test(row.value) && !hostLike.test(row.value)) return freeze({ kind: "IDENTIFIER" as const, value: row.value });
    if (row.kind === "SHA256" && typeof row.value === "string" && shaPattern.test(row.value)) return freeze({ kind: "SHA256" as const, value: row.value });
    return fail("M5_APPROVAL_EVIDENCE_INVALID");
  }).sort((a, b) => cmp(`${a.kind}:${a.value}`, `${b.kind}:${b.value}`));
  if (new Set(rows.map(x => `${x.kind}:${x.value}`)).size !== rows.length) fail("M5_APPROVAL_DUPLICATE_EVIDENCE");
  return Object.freeze(rows);
}
function parseDecision(value: unknown): M5ProviderApprovalDecision {
  if (value !== "APPROVED" && value !== "DENIED" && value !== "REQUIRES_APPROVAL" && value !== "UNKNOWN") fail("M5_APPROVAL_DECISION_INVALID");
  return value;
}
function authorityMaterial(value: unknown): Omit<M5ProviderApprovalAuthority, "approvalAuthorityId" | "approvalAuthorityFingerprint" | "recordedAt"> {
  const row = record(value);
  exact(row, ["contractVersion", "policyVersion", "authorityVersion", "approvalAuthorityId", "approvalAuthorityFingerprint", "providerId", "datasetId", "datasetVersion", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt", "usageDecisions", "retentionDecision"]);
  if (row.contractVersion !== M5_PROVIDER_APPROVAL_AUTHORITY_VERSION || row.policyVersion !== M5_PROVIDER_APPROVAL_POLICY_VERSION) fail("M5_APPROVAL_VERSION_INVALID");
  const usages = row.usageDecisions;
  if (!Array.isArray(usages)) fail("M5_APPROVAL_USAGE_SET_INVALID");
  const usageDecisions = usages.map(value => {
    const item = record(value); exact(item, ["usage", "decision", "evidence"]);
    if (typeof item.usage !== "string" || !M5_PROVIDER_USAGES.includes(item.usage as M5ProviderUsage)) fail("M5_APPROVAL_USAGE_INVALID");
    const decision = parseDecision(item.decision); const evidence = parseEvidence(item.evidence);
    if (decision === "APPROVED" && evidence.length === 0) fail("M5_APPROVAL_EVIDENCE_REQUIRED");
    return freeze({ usage: item.usage as M5ProviderUsage, decision, evidence });
  }).sort((a, b) => cmp(a.usage, b.usage));
  const exactUsages = [...M5_PROVIDER_USAGES].sort(cmp);
  if (usageDecisions.length !== exactUsages.length || new Set(usageDecisions.map(x => x.usage)).size !== exactUsages.length || usageDecisions.some((x, i) => x.usage !== exactUsages[i])) fail("M5_APPROVAL_USAGE_SET_INVALID");
  const retention = record(row.retentionDecision); exact(retention, ["decision", "evidence"]);
  const reviewedAt = time(row.reviewedAt); const effectiveFrom = time(row.effectiveFrom);
  const expiresAt = row.expiresAt === undefined ? undefined : time(row.expiresAt);
  if (reviewedAt > effectiveFrom || (expiresAt !== undefined && expiresAt <= effectiveFrom)) fail("M5_APPROVAL_TIME_RANGE_INVALID");
  return freeze({ contractVersion: M5_PROVIDER_APPROVAL_AUTHORITY_VERSION, policyVersion: M5_PROVIDER_APPROVAL_POLICY_VERSION,
    authorityVersion: text(row.authorityVersion), providerId: text(row.providerId), datasetId: text(row.datasetId), datasetVersion: text(row.datasetVersion),
    reviewedAt, effectiveFrom, ...(expiresAt ? { expiresAt } : {}), usageDecisions: Object.freeze(usageDecisions),
    retentionDecision: (() => {
      const decision = parseDecision(retention.decision); const evidence = parseEvidence(retention.evidence);
      if (decision === "APPROVED" && evidence.length === 0) fail("M5_APPROVAL_EVIDENCE_REQUIRED");
      return freeze({ decision, evidence });
    })() });
}

export function parseM5ProviderApprovalAuthority(input: unknown): M5ProviderApprovalAuthority {
  try {
    dataTree(input);
    const row = record(input);
    const core = authorityMaterial(row);
    const recordedAt = time(row.recordedAt);
    const expectedFingerprint = hash(material(core));
    const expectedId = `m5-provider-approval-authority:${expectedFingerprint}`;
    if (row.approvalAuthorityFingerprint !== expectedFingerprint || row.approvalAuthorityId !== expectedId) fail("M5_APPROVAL_IDENTITY_MISMATCH");
    return freeze({ ...core, approvalAuthorityId: expectedId, approvalAuthorityFingerprint: expectedFingerprint, recordedAt });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("M5_APPROVAL_")) throw new Error(error.message);
    throw new Error("M5_APPROVAL_AUTHORITY_INVALID");
  }
}

/** Canonical constructor for reviewed authority material; identity excludes recordedAt. */
export function createM5ProviderApprovalAuthority(input: unknown): M5ProviderApprovalAuthority {
  try {
    dataTree(input);
    const row = record(input);
    exact(row, ["contractVersion", "policyVersion", "authorityVersion", "providerId", "datasetId", "datasetVersion", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt", "usageDecisions", "retentionDecision"]);
    const core = authorityMaterial({ ...row, approvalAuthorityId: "pending", approvalAuthorityFingerprint: "0".repeat(64) });
    const fingerprint = hash(material(core));
    return parseM5ProviderApprovalAuthority({ ...core, approvalAuthorityId: `m5-provider-approval-authority:${fingerprint}`, approvalAuthorityFingerprint: fingerprint, recordedAt: row.recordedAt });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("M5_APPROVAL_")) throw new Error(error.message);
    throw new Error("M5_APPROVAL_AUTHORITY_INVALID");
  }
}

export function m5ProviderApprovalAuthorityFingerprint(authority: M5ProviderApprovalAuthority): string {
  return hash(material(authorityMaterial(authority)));
}
