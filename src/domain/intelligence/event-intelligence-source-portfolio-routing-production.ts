import "server-only";
import config from "../../../config/intelligence/event-intelligence-source-portfolio-routing.production.json";
import { types } from "node:util";

const FIELDS = ["contractVersion", "selectedSourcePortfolio", "activeRoutes", "credentialReferences", "scheduler", "acquisition", "sourceRetrieval", "rawStorage", "normalizedStorage", "persistence", "mapping", "correctionResolution", "corroboration", "eventAuthority", "signal", "trading", "approvals"] as const;
const APPROVALS = ["ACQUISITION", "PROCESSING", "RAW_STORAGE", "METADATA_STORAGE", "NORMALIZED_STORAGE", "PERSISTENCE", "RETENTION", "REDISTRIBUTION", "COMMERCIAL_USE"] as const;
const reject = (): never => { throw new Error("SOURCE_PORTFOLIO_PRODUCTION_CONFIG_INVALID"); };
function exact(v: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || types.isProxy(v) || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return reject();
  const keys = Reflect.ownKeys(v); if (keys.length !== fields.length || keys.some(k => typeof k !== "string" || !fields.includes(k))) return reject();
  const out: Record<string, unknown> = Object.create(null);
  for (const k of fields) { const d = Object.getOwnPropertyDescriptor(v, k); if (!d || !("value" in d) || !d.enumerable) return reject(); out[k] = d.value; }
  return out;
}
export function parseSourcePortfolioProductionConfig(value: unknown): Readonly<Record<string, unknown>> | null {
  try {
    const input = exact(value, FIELDS);
    const emptyList = (v: unknown) => Array.isArray(v) && !types.isProxy(v) && Object.getPrototypeOf(v) === Array.prototype && v.length === 0 && Reflect.ownKeys(v).length === 1;
    if (input.contractVersion !== "event-intelligence-source-portfolio-routing-production/v1" || input.selectedSourcePortfolio !== null || !emptyList(input.activeRoutes) || !emptyList(input.credentialReferences)) return null;
    for (const key of FIELDS.slice(4, 16)) if (input[key] !== "BLOCKED") return null;
    const approval = exact(input.approvals, APPROVALS);
    for (const key of APPROVALS) if (approval[key] !== "NOT_APPROVED") return null;
    return freeze({ ...input, activeRoutes: [], credentialReferences: [], approvals: { ...approval } });
  } catch { return null; }
}
const parsed = parseSourcePortfolioProductionConfig(config);
if (parsed === null) throw new Error("SOURCE_PORTFOLIO_PRODUCTION_CONFIG_INVALID");
function freeze<T>(v: T): T { if (v && typeof v === "object") { for (const x of Object.values(v as Record<string, unknown>)) freeze(x); Object.freeze(v); } return v; }
export const EVENT_INTELLIGENCE_SOURCE_PORTFOLIO_PRODUCTION = parsed;
