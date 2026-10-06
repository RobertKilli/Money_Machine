import "server-only";

/**
 * Operational permits are code-pinned, short-lived review artifacts. Keep this
 * registry empty until a separately approved live run supplies a reviewed,
 * real operator contact and exact request scope.
 */
export type SecEdgar8kLocalSmokeAuthorization = Readonly<{
  authorizationId: string;
  cik: "0000789019";
  accession: "0001193125-23-255762";
  form: "8-K";
  profileIds: readonly ("COMPANY_SUBMISSIONS_JSON" | "SUBMISSIONS_HISTORY_JSON" | "FILING_INDEX")[];
  userAgentIdentityRef: string;
  operatorContact: string;
  expiresAt: string;
  maxRequests: 3;
  minimumIntervalMs: 1000;
}>;

export const SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS: readonly SecEdgar8kLocalSmokeAuthorization[] = Object.freeze([]);
