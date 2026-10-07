import "server-only";

import { createSecEdgar8kLocalSmokeRequestPlan } from "@/domain/intelligence/sec-edgar-8k-event-source-qualification";
import { evaluateSecEdgar8kLocalSmokeQualification, SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS, parseSecEdgar8kLocalSmokeQualification } from "@/domain/intelligence/sec-edgar-8k-local-smoke-qualification";
import { SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS } from "./sec-edgar-8k-local-smoke-authorization";
import { isValidSecEdgar8kOperatorContact, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE } from "./sec-edgar-8k-node-transport";
import { createSecEdgar8kLocalSmokeDryRun } from "./sec-edgar-8k-local-smoke-dry-run";
import { runSecEdgar8kLocalSmoke } from "./sec-edgar-8k-local-smoke-runner";

type CliFailureCode =
  | "SEC_SMOKE_CLI_ARGUMENTS_INVALID"
  | "SEC_SMOKE_QUALIFICATION_REFERENCE_REQUIRED"
  | "SEC_SMOKE_QUALIFICATION_REFERENCE_UNAVAILABLE"
  | "SEC_SMOKE_AUTHORIZATION_REQUIRED"
  | "SEC_SMOKE_OPERATOR_CONTACT_REQUIRED"
  | "SEC_SMOKE_REQUEST_PLAN_INVALID";

export type SecEdgar8kSmokeCliResult = Readonly<{ exitCode: 0 | 1; output: string }>;
type ParsedCommand = Readonly<{ mode: "DRY_RUN" }> | Readonly<{ mode: "EXECUTE"; qualificationReference: string; authorizationId: string }>;

const QUALIFICATION_REFERENCE = /^sec-edgar-8k-local-smoke-qualification:[a-f0-9]{64}$/;
const AUTHORIZATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
const EXPECTED_PROFILES = ["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"] as const;
const blocked = (code: CliFailureCode): SecEdgar8kSmokeCliResult => Object.freeze({ exitCode: 1, output: JSON.stringify({ status: "BLOCKED", code }) });
const success = (value: unknown): SecEdgar8kSmokeCliResult => Object.freeze({ exitCode: 0, output: `${JSON.stringify(value, null, 2)}\n` });

function parseCommand(input: unknown): ParsedCommand | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== input.length + 1 || !keys.includes("length")) return null;
    const args: string[] = [];
    for (let i = 0; i < input.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") return null;
      args.push(descriptor.value);
    }
    if (args.length === 1 && args[0] === "--dry-run") return Object.freeze({ mode: "DRY_RUN" });
    if (args.length !== 5 || args[0] !== "--execute" || args[1] !== "--qualification-ref" || args[3] !== "--permit-id") return null;
    if (!QUALIFICATION_REFERENCE.test(args[2]!) || !AUTHORIZATION_ID.test(args[4]!)) return null;
    return Object.freeze({ mode: "EXECUTE", qualificationReference: args[2]!, authorizationId: args[4]! });
  } catch {
    return null;
  }
}

/** Local CLI boundary. All execute authority comes from code-pinned records, never argv payloads. */
export async function runSecEdgar8kSmokeCli(args: unknown, operatorContact: unknown): Promise<SecEdgar8kSmokeCliResult> {
  const command = parseCommand(args);
  if (!command) return blocked("SEC_SMOKE_CLI_ARGUMENTS_INVALID");
  if (command.mode === "DRY_RUN") return success(createSecEdgar8kLocalSmokeDryRun(operatorContact, new Date().toISOString()));

  const qualificationMatches = SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS.filter((entry) => entry.reference === command.qualificationReference);
  if (qualificationMatches.length !== 1) return blocked("SEC_SMOKE_QUALIFICATION_REFERENCE_UNAVAILABLE");
  const pinnedRecord = qualificationMatches[0]!;
  const parsed = parseSecEdgar8kLocalSmokeQualification(pinnedRecord.material);
  if (parsed.status !== "VALID" || parsed.qualification.status !== "APPROVED_FOR_LOCAL_SMOKE" || parsed.qualification.qualificationReference !== command.qualificationReference || evaluateSecEdgar8kLocalSmokeQualification(parsed.qualification, new Date().toISOString()).status !== "APPROVED_FOR_LOCAL_SMOKE") {
    return blocked("SEC_SMOKE_QUALIFICATION_REFERENCE_UNAVAILABLE");
  }

  const permitMatches = SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS.filter((entry) => entry.authorizationId === command.authorizationId);
  if (permitMatches.length !== 1) return blocked("SEC_SMOKE_AUTHORIZATION_REQUIRED");
  const permit = permitMatches[0]!;
  const permitNow = Date.now();
  const expiresAt = permit ? Date.parse(permit.expiresAt) : Number.NaN;
  if (!permit || permit.qualificationReference !== command.qualificationReference || permit.userAgentIdentityRef !== parsed.qualification.userAgentIdentityRef || permit.cik !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik || permit.accession !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession || permit.form !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.form || permit.maxRequests !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests || permit.minimumIntervalMs < SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.minimumIntervalMs || permit.profileIds.length !== EXPECTED_PROFILES.length || !EXPECTED_PROFILES.every((profile) => permit.profileIds.includes(profile)) || !Number.isFinite(expiresAt) || expiresAt <= permitNow || expiresAt - permitNow > 24 * 60 * 60 * 1000) {
    return blocked("SEC_SMOKE_AUTHORIZATION_REQUIRED");
  }
  if (!isValidSecEdgar8kOperatorContact(operatorContact)) return blocked("SEC_SMOKE_OPERATOR_CONTACT_REQUIRED");

  const now = new Date().toISOString();
  const initialPlan = createSecEdgar8kLocalSmokeRequestPlan(parsed.qualification, {
    profileId: "COMPANY_SUBMISSIONS_JSON",
    form: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.form,
    cik: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik,
    accession: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession,
    documentFilename: null,
    userAgentIdentityRef: permit.userAgentIdentityRef,
    now,
    timeoutMs: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.timeoutMs,
    maxResponseBytes: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxResponseBytes,
    pageCount: 1,
    fileCount: 1,
    attempts: 1,
    redirectHost: "data.sec.gov",
    approvals: [],
  });
  if (!initialPlan) return blocked("SEC_SMOKE_REQUEST_PLAN_INVALID");

  try {
    const result = await runSecEdgar8kLocalSmoke({ initialPlan, operatorContact, authorizationId: permit.authorizationId });
    // Keep the contact in process-local configuration; never echo it or raw response bytes.
    return Object.freeze({ exitCode: result.status === "BLOCKED" ? 1 : 0, output: `${JSON.stringify(result, null, 2)}\n` });
  } catch {
    return blocked("SEC_SMOKE_REQUEST_PLAN_INVALID");
  }
}
