import { reduceIngestionLifecycle, type LifecycleEvent } from "@/domain/intelligence/ingestion-provenance";

export type SecObservationField = Readonly<{ value: string | null; sources: readonly string[] }>;
export type SecObservationRecord = Readonly<{
  requestId: string;
  attemptId: string;
  sourceObservationId: string;
  lifecycleStatus: "COMPLETED";
  cik: SecObservationField;
  accession: SecObservationField;
  form: SecObservationField;
  filingDate: SecObservationField;
  acceptanceDateTime: SecObservationField;
  retrievedAt: SecObservationField;
  authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION";
  eventDate: Readonly<{ status: "UNKNOWN"; value: null; sources: readonly string[] }>;
  primaryDocumentContent: "NOT_RETRIEVED";
}>;
export type SecObservationIncomplete = Readonly<{ requestId: string; attemptId: string | null; lifecycleStatus: string }>;
export type SecObservationReadModel = Readonly<{
  status: "NO_RECORDED_OBSERVATIONS" | "INGESTION_INCOMPLETE" | "OBSERVATIONS_AVAILABLE";
  observations: readonly SecObservationRecord[];
  incomplete: readonly SecObservationIncomplete[];
}>;

export type SecObservationReadRow = Readonly<{ requestId: string; attemptId: string | null; sourceObservationId: string | null; retrievedAt: string | null; envelope: unknown; events: readonly LifecycleEvent[] }>;
const field = (value: unknown): SecObservationField | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as { value?: unknown; sources?: unknown };
  if (!(entry.value === null || typeof entry.value === "string") || !Array.isArray(entry.sources) || !entry.sources.every(source => typeof source === "string" && source.length > 0)) return null;
  return Object.freeze({ value: entry.value, sources: Object.freeze([...entry.sources]) });
};

export function projectSecEdgar8kObservations(rows: readonly SecObservationReadRow[]): SecObservationReadModel {
  const observations: SecObservationRecord[] = [];
  const incomplete: SecObservationIncomplete[] = [];
  for (const row of rows) {
    const lifecycle = reduceIngestionLifecycle(row.events);
    const env = row.envelope && typeof row.envelope === "object" && !Array.isArray(row.envelope) ? row.envelope as Record<string, unknown> : null;
    const identity = env?.identity && typeof env.identity === "object" && !Array.isArray(env.identity) ? env.identity as Record<string, unknown> : null;
    const cik = field(identity?.cik), accession = field(identity?.accession), form = field(identity?.form), filingDate = field(identity?.filingDate), acceptanceDateTime = field(identity?.acceptanceDateTime);
    if (lifecycle.status === "COMPLETED" && row.attemptId && row.sourceObservationId && row.retrievedAt && cik && accession && form && filingDate && acceptanceDateTime && identity?.eventDate && field(identity.eventDate)?.value === null && identity.primaryDocument && typeof identity.primaryDocument === "object" && (identity.primaryDocument as Record<string, unknown>).contentRetrieved === false) {
      observations.push(Object.freeze({ requestId: row.requestId, attemptId: row.attemptId, sourceObservationId: row.sourceObservationId, lifecycleStatus: "COMPLETED", cik, accession, form, filingDate, acceptanceDateTime, retrievedAt: Object.freeze({ value: row.retrievedAt, sources: Object.freeze([`source-observation:${row.sourceObservationId}:retrieved_at`]) }), authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", eventDate: Object.freeze({ status: "UNKNOWN", value: null, sources: Object.freeze([]) }), primaryDocumentContent: "NOT_RETRIEVED" }));
    } else {
      incomplete.push(Object.freeze({ requestId: row.requestId, attemptId: row.attemptId, lifecycleStatus: lifecycle.status }));
    }
  }
  const status = observations.length ? "OBSERVATIONS_AVAILABLE" : incomplete.length ? "INGESTION_INCOMPLETE" : "NO_RECORDED_OBSERVATIONS";
  return Object.freeze({ status, observations: Object.freeze(observations), incomplete: Object.freeze(incomplete) });
}
