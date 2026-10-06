import "server-only";

/** Immutable scope shared by the local-smoke qualification, planner and transport. */
export const SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE = Object.freeze({
  company: "Microsoft Corporation",
  cik: "0000789019",
  form: "8-K",
  accession: "0001193125-23-255762",
  filingDate: "2023-10-13",
  acceptanceUtc: "2023-10-13T08:37:32.000Z",
  primaryDocument: "d537928d8k.htm",
  profileIds: Object.freeze(["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"] as const),
  maxRequests: 3,
  minimumIntervalMs: 1000,
  timeoutMs: 10_000,
  maxResponseBytes: 2 * 1024 * 1024,
} as const);

export const SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS = Object.freeze({
  historyFilesMax: 1,
  historySelection: "MANIFEST_REFERENCED_DATE_RANGE_ONLY",
  retries: 0,
  attemptsPerRequest: 1,
  rawBytes: "PROCESS_MEMORY_ONE_SHOT_AND_CLEARED",
  metadata: "NON_AUTHORITATIVE_PROCESS_MEMORY_ONLY",
  completenessGuarantee: "NONE",
  freshnessGuarantee: "NONE",
  primaryDocuments: "NOT_REQUESTED",
  exhibits: "NOT_REQUESTED",
  eventInference: "NOT_PERMITTED",
  aiProcessing: "NOT_PERMITTED",
  persistence: "NOT_PERMITTED",
  redistribution: "NOT_PERMITTED",
} as const);
