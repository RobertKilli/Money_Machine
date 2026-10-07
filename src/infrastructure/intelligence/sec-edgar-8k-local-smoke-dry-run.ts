import "server-only";

import {
  evaluateSecEdgar8kLocalSmokeQualification,
  parseSecEdgar8kLocalSmokeQualification,
  SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS,
  type SecEdgar8kLocalSmokeQualification,
} from "@/domain/intelligence/sec-edgar-8k-local-smoke-qualification";
import { SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE } from "@/domain/intelligence/sec-edgar-8k-local-smoke-scope";
import { SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS } from "./sec-edgar-8k-local-smoke-authorization";
import { isValidSecEdgar8kOperatorContact, SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN } from "./sec-edgar-8k-node-transport";

type WindowStatus = "OPEN" | "NOT_YET_OPEN" | "CLOSED" | "UNKNOWN" | "NOT_PINNED" | "AMBIGUOUS" | "INVALID";
type QualificationStatus = "PINNED_APPROVED" | "PINNED_PROPOSED" | "NOT_PINNED" | "AMBIGUOUS" | "INVALID";
type PermitStatus = "NOT_PINNED" | "AMBIGUOUS" | "PINNED_VALID" | "PINNED_INVALID";

const canonicalTime = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Network-free preflight: code availability and current execute permission are separate facts. */
export function createSecEdgar8kLocalSmokeDryRun(operatorContact: unknown, now: unknown) {
  const pins = SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS;
  let qualificationStatus: QualificationStatus = pins.length === 0 ? "NOT_PINNED" : pins.length !== 1 ? "AMBIGUOUS" : "INVALID";
  let qualification: SecEdgar8kLocalSmokeQualification | null = null;
  if (pins.length === 1) {
    const parsed = parseSecEdgar8kLocalSmokeQualification(pins[0]!.material);
    if (parsed.status === "VALID" && parsed.qualification.qualificationReference === pins[0]!.reference) {
      qualification = parsed.qualification;
      qualificationStatus = parsed.qualification.status === "APPROVED_FOR_LOCAL_SMOKE" ? "PINNED_APPROVED" : "PINNED_PROPOSED";
    }
  }

  let qualificationWindow: WindowStatus = !qualification || !canonicalTime(now) ? "UNKNOWN" :
    Date.parse(now) < Date.parse(qualification.effectiveFrom) ? "NOT_YET_OPEN" :
      Date.parse(now) >= Date.parse(qualification.expiresAt) ? "CLOSED" : "OPEN";
  if (qualificationStatus === "NOT_PINNED") qualificationWindow = "NOT_PINNED";
  else if (qualificationStatus === "AMBIGUOUS") qualificationWindow = "AMBIGUOUS";
  else if (qualificationStatus === "INVALID") qualificationWindow = "INVALID";

  const qualificationGate = qualification && canonicalTime(now)
    ? evaluateSecEdgar8kLocalSmokeQualification(qualification, now)
    : null;
  const currentlyQualified = qualificationGate?.status === "APPROVED_FOR_LOCAL_SMOKE";
  const permits = qualification
    ? SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS.filter((permit) => permit.qualificationReference === qualification.qualificationReference)
    : [];
  let permitStatus: PermitStatus = permits.length === 0 ? "NOT_PINNED" : permits.length !== 1 ? "AMBIGUOUS" : "PINNED_INVALID";
  if (permits.length === 1 && qualification && canonicalTime(now)) {
    const permit = permits[0]!;
    const expectedProfiles = SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.profileIds;
    const profilesMatch = permit.profileIds.length === expectedProfiles.length && expectedProfiles.every((profile) => permit.profileIds.includes(profile));
    const permitExpires = canonicalTime(permit.expiresAt) ? Date.parse(permit.expiresAt) : Number.NaN;
    const nowMs = Date.parse(now);
    if (permit.userAgentIdentityRef === qualification.userAgentIdentityRef && permit.cik === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik &&
      permit.accession === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession && permit.form === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.form &&
      permit.maxRequests === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests && permit.minimumIntervalMs >= SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.minimumIntervalMs &&
      profilesMatch && Number.isFinite(permitExpires) && permitExpires > nowMs && permitExpires <= nowMs + 24 * 60 * 60 * 1000 &&
      permitExpires <= Date.parse(qualification.expiresAt)) {
      permitStatus = "PINNED_VALID";
    }
  }

  const contactStatus = operatorContact === undefined || operatorContact === null || operatorContact === ""
    ? "UNSET" as const
    : isValidSecEdgar8kOperatorContact(operatorContact) ? "FORMAT_VALID" as const : "FORMAT_INVALID" as const;
  const blockers: string[] = [];
  if (!currentlyQualified) {
    blockers.push(qualificationStatus === "NOT_PINNED" ? "LOCAL_SMOKE_QUALIFICATION_NOT_PINNED" :
      qualificationStatus === "AMBIGUOUS" ? "LOCAL_SMOKE_QUALIFICATION_AMBIGUOUS" :
        qualificationStatus === "INVALID" ? "LOCAL_SMOKE_QUALIFICATION_INVALID" :
          qualificationWindow === "NOT_YET_OPEN" ? "LOCAL_SMOKE_WINDOW_NOT_YET_OPEN" :
            qualificationWindow === "CLOSED" ? "LOCAL_SMOKE_WINDOW_CLOSED" : "LOCAL_SMOKE_QUALIFICATION_NOT_APPROVED");
  }
  if (permitStatus !== "PINNED_VALID") blockers.push(permitStatus === "NOT_PINNED" ? "LOCAL_SMOKE_PERMIT_NOT_PINNED" : "LOCAL_SMOKE_PERMIT_INVALID");
  if (contactStatus !== "FORMAT_VALID") blockers.push(contactStatus === "UNSET" ? "LOCAL_OPERATOR_CONTACT_UNSET" : "LOCAL_OPERATOR_CONTACT_FORMAT_INVALID");

  return Object.freeze({
    ...SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN,
    status: "BLOCKED" as const,
    codeReadiness: "READY" as const,
    qualificationStatus,
    qualificationReference: qualification?.qualificationReference ?? null,
    qualificationWindow: Object.freeze({ status: qualificationWindow, effectiveFrom: qualification?.effectiveFrom ?? null, expiresAt: qualification?.expiresAt ?? null }),
    permitStatus,
    operatorContactStatus: contactStatus,
    permissionToExecuteNow: blockers.length === 0 ? "READY_NOW" as const : "BLOCKED" as const,
    blockedBy: Object.freeze(blockers),
    networkRequests: 0 as const,
  });
}
