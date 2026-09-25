import productionRegistry from "../../../config/m5/provider-approval-authorities.production.json";
import {
  parseM5ProviderApprovalAuthority,
  type M5ProviderApprovalAuthority,
  type M5ProviderApprovalDecision,
} from "@/domain/intelligence/m5-provider-approval-authority";

export const M5_PROVIDER_APPROVAL_AUTHORITY_REGISTRY_VERSION = "m5-provider-approval-authority-registry/v1" as const;
export type M5ProviderApprovalAuthorityRegistryEntry = Readonly<{
  approvalAuthorityId: string; approvalAuthorityFingerprint: string; providerId: string; datasetId: string; datasetVersion: string;
}>;
export type M5ProviderApprovalAuthorityResolution = Readonly<{
  result: "RESOLVED" | "BLOCKED" | "INVALID";
  authority?: M5ProviderApprovalAuthority;
  blockers: readonly string[];
  asOf: string;
}>;
export type M5ProviderApprovalAuthorityResolver = Readonly<{
  resolve: (request: M5ProviderApprovalAuthorityRequest) => M5ProviderApprovalAuthorityResolution;
  isTrusted: (value: unknown) => value is M5ProviderApprovalAuthorityResolution;
}>;
export type M5ProviderApprovalAuthorityRequest = Readonly<{
  approvalAuthorityId: string; approvalAuthorityFingerprint: string;
  providerId: string; datasetId: string; datasetVersion: string; asOf: string;
}>;

const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9._:/-]{0,255}$/.test(value) && !/(?:api[-_]?key|credential|password|secret|token|private[-_]?key|email|phone)/i.test(value) && !/(?:^|\/)(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|$)/i.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
function fail(code: string): never { throw new Error(code); }
function ownDataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("M5_APPROVAL_REGISTRY_INVALID");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null || Object.getOwnPropertySymbols(value).length) fail("M5_APPROVAL_REGISTRY_INVALID");
  const record = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("M5_APPROVAL_REGISTRY_INVALID");
  }
  return record;
}
function exact(record: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(record).some(key => !fields.includes(key)) || fields.some(key => key in record && !Object.hasOwn(record, key))) fail("M5_APPROVAL_REGISTRY_INVALID");
}
function safeArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) return false;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || names.some(k => k !== "length" && (!/^(0|[1-9]\d*)$/.test(k) || Number(k) >= value.length))) return false;
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !("value" in d)) return false; }
  return true;
}
function parseEntry(value: unknown): M5ProviderApprovalAuthorityRegistryEntry {
  const row = ownDataRecord(value);
  exact(row, ["approvalAuthorityId", "approvalAuthorityFingerprint", "providerId", "datasetId", "datasetVersion"]);
  if (!safeId(row.approvalAuthorityId) || !sha(row.approvalAuthorityFingerprint) || !safeId(row.providerId) || !safeId(row.datasetId) || !safeId(row.datasetVersion)) fail("M5_APPROVAL_REGISTRY_INVALID");
  return freeze({ approvalAuthorityId: row.approvalAuthorityId, approvalAuthorityFingerprint: row.approvalAuthorityFingerprint,
    providerId: row.providerId, datasetId: row.datasetId, datasetVersion: row.datasetVersion });
}
type ParsedRegistry = Readonly<{ entries: readonly M5ProviderApprovalAuthorityRegistryEntry[]; authorities: readonly M5ProviderApprovalAuthority[] }>;
function parseRegistry(input: unknown): ParsedRegistry {
  const row = ownDataRecord(input);
  exact(row, ["contractVersion", "entries", "authorities"]);
  if (row.contractVersion !== M5_PROVIDER_APPROVAL_AUTHORITY_REGISTRY_VERSION || !safeArray(row.entries) || !safeArray(row.authorities)) fail("M5_APPROVAL_REGISTRY_INVALID");
  const entries = row.entries.map(parseEntry).sort((a, b) => cmp(a.approvalAuthorityId, b.approvalAuthorityId));
  const scopes = entries.map(entry => `${entry.providerId}\u0000${entry.datasetId}\u0000${entry.datasetVersion}`);
  if (new Set(entries.map(entry => entry.approvalAuthorityId)).size !== entries.length || new Set(scopes).size !== scopes.length) fail("M5_APPROVAL_REGISTRY_CONFLICT");
  const authorities = row.authorities.map(parseM5ProviderApprovalAuthority).sort((a, b) => cmp(a.approvalAuthorityId, b.approvalAuthorityId) || cmp(a.recordedAt, b.recordedAt));
  const unique = new Map<string, M5ProviderApprovalAuthority>();
  for (const authority of authorities) {
    const previous = unique.get(authority.approvalAuthorityId);
    if (previous && previous.approvalAuthorityFingerprint !== authority.approvalAuthorityFingerprint) fail("M5_APPROVAL_REGISTRY_CONFLICT");
    if (!previous) unique.set(authority.approvalAuthorityId, authority);
  }
  const uniqueAuthorities = [...unique.values()];
  for (const authority of uniqueAuthorities) {
    const entry = entries.find(item => item.approvalAuthorityId === authority.approvalAuthorityId);
    if (!entry || entry.approvalAuthorityFingerprint !== authority.approvalAuthorityFingerprint || entry.providerId !== authority.providerId || entry.datasetId !== authority.datasetId || entry.datasetVersion !== authority.datasetVersion) fail("M5_APPROVAL_REGISTRY_SCOPE_MISMATCH");
  }
  const authorityScopes = uniqueAuthorities.map(authority => `${authority.providerId}\u0000${authority.datasetId}\u0000${authority.datasetVersion}`);
  if (new Set(authorityScopes).size !== authorityScopes.length) fail("M5_APPROVAL_REGISTRY_CONFLICT");
  return freeze({ entries: Object.freeze(entries), authorities: Object.freeze(uniqueAuthorities) });
}
function parseRequest(value: unknown): M5ProviderApprovalAuthorityRequest {
  const row = ownDataRecord(value);
  exact(row, ["approvalAuthorityId", "approvalAuthorityFingerprint", "providerId", "datasetId", "datasetVersion", "asOf"]);
  if (!safeId(row.approvalAuthorityId) || !sha(row.approvalAuthorityFingerprint) || !safeId(row.providerId) || !safeId(row.datasetId) || !safeId(row.datasetVersion) || !timestamp(row.asOf)) fail("M5_APPROVAL_REQUEST_INVALID");
  return freeze({ approvalAuthorityId: row.approvalAuthorityId, approvalAuthorityFingerprint: row.approvalAuthorityFingerprint,
    providerId: row.providerId, datasetId: row.datasetId, datasetVersion: row.datasetVersion, asOf: row.asOf });
}

/** Creates an isolated resolver from a copied, canonical allowlist and authority snapshot. */
export function createM5ProviderApprovalAuthorityResolver(registryInput: unknown): M5ProviderApprovalAuthorityResolver {
  let registry: ParsedRegistry;
  try { registry = parseRegistry(registryInput); }
  catch (error) { throw new Error(error instanceof Error && error.message.startsWith("M5_APPROVAL_") ? error.message : "M5_APPROVAL_REGISTRY_INVALID"); }
  const trusted = new WeakSet<object>();
  const resolve = (requestInput: M5ProviderApprovalAuthorityRequest): M5ProviderApprovalAuthorityResolution => {
    const blockers = new Set<string>();
    let authority: M5ProviderApprovalAuthority | undefined;
    let result: M5ProviderApprovalAuthorityResolution["result"] = "BLOCKED";
    let asOf = "";
    try {
      const request = parseRequest(requestInput);
      asOf = request.asOf;
      const entry = registry.entries.find(item => item.approvalAuthorityId === request.approvalAuthorityId);
      if (!entry || entry.approvalAuthorityFingerprint !== request.approvalAuthorityFingerprint) blockers.add("M5_APPROVAL_AUTHORITY_NOT_ALLOWLISTED");
      else if (entry.providerId !== request.providerId || entry.datasetId !== request.datasetId || entry.datasetVersion !== request.datasetVersion) blockers.add("M5_APPROVAL_AUTHORITY_SCOPE_MISMATCH");
      else {
        authority = registry.authorities.find(item => item.approvalAuthorityId === entry.approvalAuthorityId);
        if (!authority) blockers.add("M5_APPROVAL_AUTHORITY_MISSING");
        else if (asOf < authority.reviewedAt) blockers.add("M5_APPROVAL_AUTHORITY_NOT_REVIEWED");
        else if (asOf < authority.effectiveFrom) blockers.add("M5_APPROVAL_AUTHORITY_NOT_YET_EFFECTIVE");
        else if (authority.expiresAt !== undefined && authority.expiresAt <= asOf) blockers.add("M5_APPROVAL_AUTHORITY_EXPIRED");
        else result = "RESOLVED";
      }
    } catch { authority = undefined; result = "INVALID"; blockers.add("M5_APPROVAL_AUTHORITY_INVALID"); }
    const value = freeze({ result, ...(authority ? { authority } : {}), blockers: [...blockers].sort(cmp), asOf });
    if (result === "RESOLVED") trusted.add(value);
    return value;
  };
  return Object.freeze({ resolve, isTrusted: (value: unknown): value is M5ProviderApprovalAuthorityResolution => typeof value === "object" && value !== null && trusted.has(value) });
}

const configuredResolver = createM5ProviderApprovalAuthorityResolver(productionRegistry);
export function resolveConfiguredM5ProviderApprovalAuthority(request: M5ProviderApprovalAuthorityRequest): M5ProviderApprovalAuthorityResolution {
  return configuredResolver.resolve(request);
}
export function isTrustedConfiguredM5ProviderApprovalAuthorityResolution(value: unknown): value is M5ProviderApprovalAuthorityResolution {
  return configuredResolver.isTrusted(value);
}
export function m5ProviderApprovalDecision(authority: M5ProviderApprovalAuthority, usage: string): M5ProviderApprovalDecision | undefined {
  return authority.usageDecisions.find(item => item.usage === usage)?.decision;
}
