import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { InMemoryIntelligenceStore, type IntelligenceStore, type IntelligenceMapping, type MarketObservation, type MacroObservation, type NewsEvent, type Provenance } from "@/domain/intelligence/foundation";

type DbClient = Sql | TransactionSql;
type QueryClient = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<readonly T[]>;

const connection = (): Sql => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_UNCONFIGURED");
  return postgres(url, { max: 1, prepare: true, ssl: "require" });
};

const date = (value: unknown, code: string): Date => {
  const result = new Date(String(value));
  if (!Number.isFinite(result.getTime())) throw new Error(code);
  return result;
};

const object = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
};

const string = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value;
};

const provenance = (value: unknown): Provenance => {
  const source = object(value, "M3_PROVENANCE_INVALID");
  return {
    providerId: string(source.providerId, "M3_PROVENANCE_PROVIDER_INVALID"),
    datasetId: string(source.datasetId, "M3_PROVENANCE_DATASET_INVALID"),
    datasetVersion: string(source.datasetVersion, "M3_PROVENANCE_VERSION_INVALID"),
    externalRecordId: string(source.externalRecordId, "M3_PROVENANCE_RECORD_INVALID"),
    sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl : undefined,
    sourceType: string(source.sourceType, "M3_PROVENANCE_SOURCE_INVALID"),
    sourceMetadata: object(source.sourceMetadata ?? {}, "M3_PROVENANCE_METADATA_INVALID") as Record<string, string>,
    payloadFingerprint: string(source.payloadFingerprint, "M3_PROVENANCE_FINGERPRINT_INVALID"),
    foundationVersion: string(source.foundationVersion, "M3_PROVENANCE_VERSION_INVALID") as Provenance["foundationVersion"],
  };
};

const mappings = (value: unknown): readonly IntelligenceMapping[] => {
  if (!Array.isArray(value)) throw new Error("M3_MAPPINGS_INVALID");
  return value.map(item => {
    const row = object(item, "M3_MAPPING_INVALID");
    return {
      recordId: string(row.recordId, "M3_MAPPING_RECORD_INVALID"),
      mappingKind: string(row.mappingKind, "M3_MAPPING_KIND_INVALID") as IntelligenceMapping["mappingKind"],
      targetId: string(row.targetId, "M3_MAPPING_TARGET_INVALID"),
      source: string(row.source, "M3_MAPPING_SOURCE_INVALID") as IntelligenceMapping["source"],
      evidence: string(row.evidence, "M3_MAPPING_EVIDENCE_INVALID"),
    };
  }).sort((a, b) => a.mappingKind.localeCompare(b.mappingKind) || a.targetId.localeCompare(b.targetId) || a.recordId.localeCompare(b.recordId));
};

export function mapMarketObservationRow(row: Record<string, unknown>): MarketObservation {
  const valueAtoms = BigInt(string(row.value_atoms, "M3_MARKET_VALUE_INVALID"));
  const scale = Number(row.scale);
  if (!Number.isInteger(scale) || scale < 0) throw new Error("M3_MARKET_SCALE_INVALID");
  const availableAt = date(row.available_at, "M3_MARKET_AVAILABLE_AT_INVALID");
  const ingestedAt = date(row.ingested_at, "M3_MARKET_INGESTED_AT_INVALID");
  if (availableAt > ingestedAt) throw new Error("M3_MARKET_AVAILABILITY_INVALID");
  return {
    id: string(row.id, "M3_MARKET_ID_INVALID"),
    providerId: string(row.provider_id, "M3_MARKET_PROVIDER_INVALID"),
    datasetVersion: string(row.dataset_version, "M3_MARKET_DATASET_INVALID"),
    externalRecordId: string(row.external_record_id, "M3_MARKET_RECORD_INVALID"),
    assetId: string(row.asset_id, "M3_MARKET_ASSET_INVALID"),
    observedAt: date(row.observed_at, "M3_MARKET_OBSERVED_AT_INVALID"),
    availableAt,
    ingestedAt,
    observationType: string(row.observation_type, "M3_MARKET_TYPE_INVALID") as MarketObservation["observationType"],
    valueAtoms,
    scale,
    unit: string(row.unit, "M3_MARKET_UNIT_INVALID"),
    provenance: provenance(row.provenance),
  };
}

export function mapNewsEventRow(row: Record<string, unknown>): NewsEvent {
  const availableAt = date(row.available_at, "M3_NEWS_AVAILABLE_AT_INVALID");
  const ingestedAt = date(row.ingested_at, "M3_NEWS_INGESTED_AT_INVALID");
  if (availableAt > ingestedAt) throw new Error("M3_NEWS_AVAILABILITY_INVALID");
  const revision = Number(row.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("M3_NEWS_REVISION_INVALID");
  return {
    id: string(row.id, "M3_NEWS_ID_INVALID"),
    providerId: string(row.provider_id, "M3_NEWS_PROVIDER_INVALID"),
    datasetVersion: string(row.dataset_version, "M3_NEWS_DATASET_INVALID"),
    externalRecordId: string(row.external_record_id, "M3_NEWS_RECORD_INVALID"),
    revision,
    publishedAt: date(row.published_at, "M3_NEWS_PUBLISHED_AT_INVALID"),
    availableAt,
    ingestedAt,
    title: string(row.title, "M3_NEWS_TITLE_INVALID"),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : undefined,
    sourceType: string(row.source_type, "M3_NEWS_SOURCE_INVALID"),
    provenance: provenance(row.provenance),
    mappings: mappings(row.mappings),
  };
}

export function mapMacroObservationRow(row: Record<string, unknown>): MacroObservation {
  const availableAt = date(row.available_at, "M3_MACRO_AVAILABLE_AT_INVALID");
  const ingestedAt = date(row.ingested_at, "M3_MACRO_INGESTED_AT_INVALID");
  if (availableAt > ingestedAt) throw new Error("M3_MACRO_AVAILABILITY_INVALID");
  return {
    id: string(row.id, "M3_MACRO_ID_INVALID"),
    providerId: string(row.provider_id, "M3_MACRO_PROVIDER_INVALID"),
    datasetVersion: string(row.dataset_version, "M3_MACRO_DATASET_INVALID"),
    externalRecordId: string(row.external_record_id, "M3_MACRO_RECORD_INVALID"),
    revision: Number(row.revision),
    indicatorCode: string(row.indicator_code, "M3_MACRO_INDICATOR_INVALID"),
    geography: string(row.geography, "M3_MACRO_GEOGRAPHY_INVALID"),
    referencePeriodStart: date(row.reference_period_start, "M3_MACRO_PERIOD_INVALID"),
    referencePeriodEnd: date(row.reference_period_end, "M3_MACRO_PERIOD_INVALID"),
    observedAt: row.observed_at == null ? undefined : date(row.observed_at, "M3_MACRO_OBSERVED_AT_INVALID"),
    publishedAt: row.published_at == null ? undefined : date(row.published_at, "M3_MACRO_PUBLISHED_AT_INVALID"),
    availableAt,
    ingestedAt,
    valueAtoms: BigInt(string(row.value_atoms, "M3_MACRO_VALUE_INVALID")),
    scale: Number(row.scale),
    unit: string(row.unit, "M3_MACRO_UNIT_INVALID"),
    provenance: provenance(row.provenance),
  };
}

export interface IntelligenceReadRepository {
  readonly newsAvailableAt: (asOf: Date, datasetVersion: string) => Promise<readonly NewsEvent[]>;
  readonly marketAvailableAt: (asOf: Date, datasetVersion: string) => Promise<readonly MarketObservation[]>;
  readonly macroAvailableAt: (asOf: Date, datasetVersion: string) => Promise<readonly MacroObservation[]>;
  readonly loadStoreAt: (asOf: Date, pins: readonly { providerId: string; datasetVersion: string }[]) => Promise<IntelligenceStore>;
}

export function createIntelligenceReadRepository(client: DbClient): IntelligenceReadRepository {
  const query = client as unknown as QueryClient;
  const repository: Omit<IntelligenceReadRepository, "loadStoreAt"> = {
    newsAvailableAt: async (asOf, datasetVersion) => {
      const rows = await query<Record<string, unknown>>`select e.id,e.provider_id,e.dataset_version,e.external_record_id,e.revision,e.published_at,e.available_at,e.ingested_at,e.title,e.source_url,e.source_type,e.provenance,coalesce((select jsonb_agg(jsonb_build_object('recordId',m.record_id,'mappingKind',m.mapping_kind,'targetId',m.target_id,'source',m.mapping_source,'evidence',m.evidence) order by m.mapping_kind,m.target_id,m.record_id) from public.intelligence_record_mappings m where m.record_id=e.id),'[]'::jsonb) as mappings from public.news_event_revisions e where e.dataset_version=${datasetVersion} and e.available_at<=${asOf} order by e.available_at,e.revision,e.id`;
      const latest = new Map<string, NewsEvent>();
      for (const row of rows) {
        const event = mapNewsEventRow(row);
        const key = `${event.providerId}|${event.datasetVersion}|${event.externalRecordId}`;
        const previous = latest.get(key);
        if (!previous || event.revision > previous.revision) latest.set(key, event);
      }
      return [...latest.values()].sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime() || a.id.localeCompare(b.id));
    },
    marketAvailableAt: async (asOf, datasetVersion) => {
      const rows = await query<Record<string, unknown>>`select id,provider_id,dataset_version,external_record_id,asset_id,observed_at,available_at,ingested_at,observation_type,value_atoms,scale,unit,provenance from public.market_observations where dataset_version=${datasetVersion} and available_at<=${asOf} and observed_at<=${asOf} order by available_at,observed_at,id`;
      return rows.map(mapMarketObservationRow);
    },
    macroAvailableAt: async (asOf, datasetVersion) => {
      const rows = await query<Record<string, unknown>>`select id,provider_id,dataset_version,external_record_id,revision,indicator_code,geography,reference_period_start,reference_period_end,observed_at,published_at,available_at,ingested_at,value_atoms,scale,unit,provenance from public.macro_observations where dataset_version=${datasetVersion} and available_at<=${asOf} order by available_at,revision,id`;
      return rows.map(mapMacroObservationRow);
    },
  };
  return {
    ...repository,
    loadStoreAt: async (asOf, pins) => {
      const store = new InMemoryIntelligenceStore();
      for (const pin of pins) {
        for (const event of await repository.newsAvailableAt(asOf, pin.datasetVersion)) {
          if (event.providerId === pin.providerId) store.ingestNews(event);
        }
        for (const observation of await repository.marketAvailableAt(asOf, pin.datasetVersion)) {
          if (observation.providerId === pin.providerId) store.ingestMarket(observation);
        }
        for (const observation of await repository.macroAvailableAt(asOf, pin.datasetVersion)) {
          if (observation.providerId === pin.providerId) store.ingestMacro(observation);
        }
      }
      return store;
    },
  };
}

export async function readIntelligenceStoreAt(asOf: Date, pins: readonly { providerId: string; datasetVersion: string }[]): Promise<IntelligenceStore> {
  const sql = connection();
  try {
    return await createIntelligenceReadRepository(sql).loadStoreAt(asOf, pins);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
