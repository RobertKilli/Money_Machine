import {
  parseM5ProviderApprovalAuthority,
  type M5ProviderApprovalAuthority,
  type M5ProviderApprovalDecision,
} from "@/domain/intelligence/m5-provider-approval-authority";

export type M5ProviderApprovalAuthorityRegistryEntry = Readonly<{
  approvalAuthorityId: string; approvalAuthorityFingerprint: string; providerId: string; datasetId: string; datasetVersion: string;
}>;
export type M5ProviderApprovalAuthorityResolution = Readonly<{
  result: "RESOLVED" | "BLOCKED" | "INVALID";
  authority?: M5ProviderApprovalAuthority;
  blockers: readonly string[];
  asOf: string;
}>;
const trusted = new WeakSet<object>();
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safeIds = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9._:/-]{0,255}$/.test(value) && !/(?:api[-_]?key|credential|password|secret|token|private[-_]?key|email|phone)/i.test(value);
function safeArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length) return false;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || names.some(k => k !== "length" && (!/^(0|[1-9]\d*)$/.test(k) || Number(k) >= value.length))) return false;
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !("value" in d)) return false; }
  return true;
}
function safeRequest(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length) return false;
  const expected = ["registry", "authorities", "approvalAuthorityId", "approvalAuthorityFingerprint", "providerId", "datasetId", "datasetVersion", "asOf"];
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length !== expected.length || keys.some(key => !expected.includes(key))) return false;
  return keys.every(key => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return Boolean(descriptor?.enumerable && "value" in descriptor); });
}
function parseRegistry(input: unknown): readonly M5ProviderApprovalAuthorityRegistryEntry[] {
  if (!safeArray(input)) throw new Error("M5_APPROVAL_REGISTRY_INVALID");
  const names = Object.getOwnPropertyNames(input);
  if (Object.getOwnPropertySymbols(input).length || names.length !== input.length + 1 || names.some(k => k !== "length" && (!/^(0|[1-9]\d*)$/.test(k) || Number(k) >= input.length))) throw new Error("M5_APPROVAL_REGISTRY_INVALID");
  const result = input.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("M5_APPROVAL_REGISTRY_INVALID");
    if (Object.getOwnPropertySymbols(value).length) throw new Error("M5_APPROVAL_REGISTRY_INVALID");
    const keys = Object.getOwnPropertyNames(value);
    if (keys.length !== 5 || keys.some(key => !["approvalAuthorityId", "approvalAuthorityFingerprint", "providerId", "datasetId", "datasetVersion"].includes(key))) throw new Error("M5_APPROVAL_REGISTRY_INVALID");
    const row = value as Record<string, unknown>;
    for (const key of keys) { const d = Object.getOwnPropertyDescriptor(row, key); if (!d?.enumerable || !("value" in d)) throw new Error("M5_APPROVAL_REGISTRY_INVALID"); }
    if ([row.approvalAuthorityId, row.providerId, row.datasetId, row.datasetVersion].some(x => !safeIds(x)) || typeof row.approvalAuthorityFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.approvalAuthorityFingerprint)) throw new Error("M5_APPROVAL_REGISTRY_INVALID");
    return freeze({ approvalAuthorityId: row.approvalAuthorityId as string, approvalAuthorityFingerprint: row.approvalAuthorityFingerprint as string,
      providerId: row.providerId as string, datasetId: row.datasetId as string, datasetVersion: row.datasetVersion as string });
  }).sort((a, b) => cmp(a.approvalAuthorityId, b.approvalAuthorityId));
  const scopes = result.map(x => `${x.providerId}\u0000${x.datasetId}\u0000${x.datasetVersion}`);
  if (new Set(result.map(x => x.approvalAuthorityId)).size !== result.length || new Set(scopes).size !== scopes.length) throw new Error("M5_APPROVAL_REGISTRY_CONFLICT");
  return Object.freeze(result);
}
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; };

/** Resolves only records explicitly present in the configured allowlist. No public trust flag is accepted. */
export function resolveM5ProviderApprovalAuthority(input: Readonly<{
  registry: readonly M5ProviderApprovalAuthorityRegistryEntry[];
  authorities: readonly unknown[];
  approvalAuthorityId: string;
  approvalAuthorityFingerprint: string;
  providerId: string; datasetId: string; datasetVersion: string;
  asOf: string;
}>): M5ProviderApprovalAuthorityResolution {
  const blockers = new Set<string>();
  let authority: M5ProviderApprovalAuthority | undefined;
  let result: M5ProviderApprovalAuthorityResolution["result"] = "BLOCKED";
  let resolvedAsOf = "";
  try {
    if (!safeRequest(input)) throw new Error("INVALID");
    const asOf = input.asOf;
    if (!timestamp(asOf) || !safeArray(input.authorities)) throw new Error("INVALID");
    resolvedAsOf = asOf;
    const registry = parseRegistry(input.registry);
    const entry = registry.find(x => x.approvalAuthorityId === input.approvalAuthorityId);
    if (!entry || entry.approvalAuthorityFingerprint !== input.approvalAuthorityFingerprint) blockers.add("M5_APPROVAL_AUTHORITY_NOT_ALLOWLISTED");
    else if (entry.providerId !== input.providerId || entry.datasetId !== input.datasetId || entry.datasetVersion !== input.datasetVersion) blockers.add("M5_APPROVAL_AUTHORITY_SCOPE_MISMATCH");
    else {
      const parsedAuthorities = input.authorities.map(parseM5ProviderApprovalAuthority);
      const matchingScope = parsedAuthorities.filter(x => x.providerId === entry.providerId && x.datasetId === entry.datasetId && x.datasetVersion === entry.datasetVersion);
      if (matchingScope.length > 1) throw new Error("CONFLICT");
      const candidates = parsedAuthorities.filter(x => x.approvalAuthorityId === entry.approvalAuthorityId);
      if (candidates.length !== 1) blockers.add(candidates.length > 1 ? "M5_APPROVAL_AUTHORITY_CONFLICT" : "M5_APPROVAL_AUTHORITY_MISSING");
      else {
        authority = candidates[0];
        if (authority.approvalAuthorityFingerprint !== entry.approvalAuthorityFingerprint || authority.providerId !== entry.providerId || authority.datasetId !== entry.datasetId || authority.datasetVersion !== entry.datasetVersion) blockers.add("M5_APPROVAL_AUTHORITY_SCOPE_MISMATCH");
        else if (authority.effectiveFrom > asOf || (authority.expiresAt !== undefined && authority.expiresAt <= asOf)) blockers.add("M5_APPROVAL_AUTHORITY_EXPIRED");
        else result = "RESOLVED";
      }
    }
  } catch {
    authority = undefined; result = "INVALID"; blockers.add("M5_APPROVAL_AUTHORITY_INVALID");
  }
  const value = freeze({ result, ...(authority ? { authority } : {}), blockers: [...blockers].sort(cmp), asOf: resolvedAsOf });
  if (result === "RESOLVED") trusted.add(value);
  return value;
}

export function isTrustedM5ProviderApprovalAuthorityResolution(value: unknown): value is M5ProviderApprovalAuthorityResolution {
  return typeof value === "object" && value !== null && trusted.has(value);
}

export function m5ProviderApprovalDecision(authority: M5ProviderApprovalAuthority, usage: string): M5ProviderApprovalDecision | undefined {
  return authority.usageDecisions.find(item => item.usage === usage)?.decision;
}
