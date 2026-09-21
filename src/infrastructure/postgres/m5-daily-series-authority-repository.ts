import type { Sql, TransactionSql } from "postgres";
import { createM5DailySeriesAuthority, type M5DailySeriesDerivation, type M5DailySeriesObservationInput } from "@/domain/intelligence/m5-daily-series-authority";
import type { M5DailySeriesAuthorityAggregate, M5DailySeriesAuthorityRepositories, M5DailySeriesAuthorityUnitOfWork } from "@/application/intelligence/m5-daily-series-authority-persistence";
import { createTransactionSourceLineageRepository } from "./source-lineage-repository";

type Row = Record<string, unknown>;
const r = (v: unknown): Row => v as Row;
const text = (v: unknown, c: string): string => { if (typeof v !== "string" || !v) throw new Error(c); return v; };
const decimal = (v: unknown, c: string): bigint => { if (typeof v !== "bigint" && typeof v !== "string") throw new Error(c); const s = String(v); if (!/^(0|[1-9][0-9]*)$/.test(s)) throw new Error(c); return BigInt(s); };
const integer = (v: unknown, c: string): number => { const n = typeof v === "number" ? v : Number(v); if (!Number.isSafeInteger(n) || n < 0) throw new Error(c); return n; };
const time = (v: unknown, c: string): string => { const s = v instanceof Date ? v.toISOString() : text(v, c); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)) throw new Error(c); return s; };
const array = (v: unknown, c: string): string[] => { if (!Array.isArray(v) || v.some(x => typeof x !== "string")) throw new Error(c); return v; };

function mapDerivation(row: Row, authorityId: string): M5DailySeriesDerivation {
  return Object.freeze({ authorityId, derivationVersion: text(row.derivation_version, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") as M5DailySeriesDerivation["derivationVersion"], cadencePolicyVersion: text(row.cadence_policy_version, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") as "crypto-daily/v1", metricKind: text(row.metric_kind, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") as M5DailySeriesDerivation["metricKind"], value: decimal(row.value, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), scale: integer(row.scale, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") as 0, unit: text(row.unit, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") as M5DailySeriesDerivation["unit"], asOf: time(row.as_of, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), observedAt: time(row.observed_at, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), availableAt: time(row.available_at, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), orderedObservationIds: Object.freeze(array(row.ordered_observation_ids, "M5_DAILY_REPOSITORY_DERIVATION_INVALID")), observationCount: integer(row.observation_count, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), returnCount: integer(row.return_count, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), earliestObservedAt: time(row.earliest_observed_at, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), latestObservedAt: time(row.latest_observed_at, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), maximumObservedGap: decimal(row.maximum_observed_gap ?? 0, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), priceScale: integer(row.price_scale ?? 0, "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), quoteUnit: text(row.quote_unit ?? "USD", "M5_DAILY_REPOSITORY_DERIVATION_INVALID"), roundingVersion: text(row.rounding_version, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") as "m5-integer-floor/v1", fingerprint: text(row.fingerprint, "M5_DAILY_REPOSITORY_DERIVATION_INVALID") });
}

function mapAggregate(parent: Row, observations: readonly Row[], derivations: readonly Row[]): M5DailySeriesAuthorityAggregate {
  const authorityId = text(parent.authority_id, "M5_DAILY_REPOSITORY_PARENT_INVALID");
  const providerId = text(parent.provider_id, "M5_DAILY_REPOSITORY_PARENT_INVALID");
  const datasetId = text(parent.dataset_id, "M5_DAILY_REPOSITORY_PARENT_INVALID");
  const datasetVersion = text(parent.dataset_version, "M5_DAILY_REPOSITORY_PARENT_INVALID");
  const material = {
    providerId, datasetId, datasetVersion, providerSourceNamespace: text(parent.provider_source_namespace, "M5_DAILY_REPOSITORY_PARENT_INVALID"), sourceLineageId: text(parent.source_lineage_id, "M5_DAILY_REPOSITORY_PARENT_INVALID"), chainId: text(parent.chain_id, "M5_DAILY_REPOSITORY_PARENT_INVALID"), contractAddress: text(parent.contract_address, "M5_DAILY_REPOSITORY_PARENT_INVALID"), providerAssetIdentity: text(parent.provider_asset_identity, "M5_DAILY_REPOSITORY_PARENT_INVALID"), asOf: time(parent.as_of, "M5_DAILY_REPOSITORY_PARENT_INVALID"), recordedAt: time(parent.recorded_at, "M5_DAILY_REPOSITORY_PARENT_INVALID"), observations: observations.map(row => ({ ordinal: integer(row.observation_ordinal, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), observationId: text(row.observation_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), sourceArtifactId: text(row.source_artifact_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), sourceEnvelopeId: text(row.source_envelope_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), sourceObservationId: text(row.source_observation_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), providerExternalRecordId: text(row.provider_external_record_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), observedAt: time(row.observed_at, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), availableAt: time(row.available_at, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), closeValue: decimal(row.close_atoms, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), priceScale: integer(row.price_scale, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), quoteUnit: text(row.quote_unit, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID"), payloadFingerprint: text(row.payload_fingerprint, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID") } as M5DailySeriesObservationInput)),
  };
  const rebuilt = createM5DailySeriesAuthority(material);
  if (rebuilt.status !== "READY") throw new Error("M5_DAILY_REPOSITORY_PARENT_INVALID_STATUS");
  if (rebuilt.authority.authorityId !== authorityId) throw new Error("M5_DAILY_REPOSITORY_PARENT_INVALID");
  if (rebuilt.authority.fingerprint !== text(parent.fingerprint, "M5_DAILY_REPOSITORY_PARENT_INVALID")) throw new Error("M5_DAILY_REPOSITORY_PARENT_INVALID_FINGERPRINT");
  if (JSON.stringify(array(parent.source_artifact_ids, "M5_DAILY_REPOSITORY_PARENT_INVALID")) !== JSON.stringify(rebuilt.authority.sourceArtifactIds) || JSON.stringify(array(parent.source_envelope_ids, "M5_DAILY_REPOSITORY_PARENT_INVALID")) !== JSON.stringify(rebuilt.authority.sourceEnvelopeIds) || JSON.stringify(array(parent.source_observation_ids, "M5_DAILY_REPOSITORY_PARENT_INVALID")) !== JSON.stringify(rebuilt.authority.sourceObservationIds) || JSON.stringify(array(parent.payload_fingerprints, "M5_DAILY_REPOSITORY_PARENT_INVALID")) !== JSON.stringify(rebuilt.authority.payloadFingerprints)) throw new Error("M5_DAILY_REPOSITORY_PARENT_INVALID");
  observations.forEach((value, index) => {
    const stored = text(value.observation_fingerprint, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID");
    if (stored !== rebuilt.authority.observations[index]?.observationFingerprint || text(value.provider_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID") !== providerId || text(value.dataset_id, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID") !== datasetId || text(value.dataset_version, "M5_DAILY_REPOSITORY_OBSERVATION_INVALID") !== datasetVersion) throw new Error("M5_DAILY_REPOSITORY_OBSERVATION_INVALID");
  });
  const mapped = derivations.map(d => mapDerivation(r(d), authorityId));
  if (mapped.length !== 2 || !mapped.some(d => d.metricKind === "HISTORY_SPAN") || !mapped.some(d => d.metricKind === "VOLATILITY")) throw new Error("M5_DAILY_REPOSITORY_SEALED_SET_INVALID");
  const expected = [rebuilt.historySpan, rebuilt.volatility];
  for (const value of expected) {
    const stored = mapped.find(d => d.metricKind === value.metricKind);
    if (!stored || stored.fingerprint !== value.fingerprint || stored.value !== value.value || stored.derivationVersion !== value.derivationVersion || stored.cadencePolicyVersion !== value.cadencePolicyVersion || stored.roundingVersion !== value.roundingVersion || stored.unit !== value.unit || stored.scale !== value.scale || stored.observedAt !== value.observedAt || stored.availableAt !== value.availableAt || stored.asOf !== value.asOf || stored.observationCount !== value.observationCount || stored.returnCount !== value.returnCount || stored.earliestObservedAt !== value.earliestObservedAt || stored.latestObservedAt !== value.latestObservedAt || stored.maximumObservedGap !== value.maximumObservedGap || stored.priceScale !== value.priceScale || stored.quoteUnit !== value.quoteUnit || JSON.stringify(stored.orderedObservationIds) !== JSON.stringify(value.orderedObservationIds)) throw new Error("M5_DAILY_REPOSITORY_DERIVATION_INVALID");
  }
  return Object.freeze({ authority: rebuilt.authority, historySpan: mapped.find(d => d.metricKind === "HISTORY_SPAN")!, volatility: mapped.find(d => d.metricKind === "VOLATILITY")! });
}

export function createM5DailySeriesAuthorityTransactionRepository(client: TransactionSql) {
  const readById = async (authorityId: string): Promise<M5DailySeriesAuthorityAggregate | undefined> => {
    const parents = await client`select * from public.intelligence_m5_daily_series_authorities where authority_id=${authorityId} for update`;
    if (parents.length === 0) return undefined; if (parents.length !== 1) throw new Error("M5_DAILY_REPOSITORY_PARENT_INVALID");
    const observations = await client`select * from public.intelligence_m5_daily_series_observations where authority_id=${authorityId} order by observation_ordinal asc`;
    const derivations = await client`select d.*, a.earliest_observed_at, a.latest_observed_at, a.observation_count, a.available_at as authority_available_at from public.intelligence_m5_daily_series_derivations d join public.intelligence_m5_daily_series_authorities a on a.authority_id=d.authority_id where d.authority_id=${authorityId} order by metric_kind asc`;
    if (observations.length !== integer(r(parents[0]).observation_count, "M5_DAILY_REPOSITORY_PARENT_INVALID") || derivations.length !== 2) throw new Error("M5_DAILY_REPOSITORY_SEALED_SET_INVALID");
    return mapAggregate(r(parents[0]), observations.map(r), derivations.map(r));
  };
  const save = async (aggregate: M5DailySeriesAuthorityAggregate): Promise<M5DailySeriesAuthorityAggregate> => {
    const a = aggregate.authority;
    const inserted = await client`insert into public.intelligence_m5_daily_series_authorities (authority_id,contract_version,provider_id,dataset_id,dataset_version,provider_source_namespace,source_lineage_id,chain_id,contract_address,provider_asset_identity,quote_unit,price_scale,as_of,source_artifact_ids,source_envelope_ids,source_observation_ids,payload_fingerprints,observation_count,earliest_observed_at,latest_observed_at,available_at,fingerprint,recorded_at) values (${a.authorityId},${a.contractVersion},${a.providerId},${a.datasetId},${a.datasetVersion},${a.providerSourceNamespace},${a.sourceLineageId},${a.chainId},${a.contractAddress},${a.providerAssetIdentity},${a.quoteUnit},${a.priceScale},${a.asOf},${client.json(a.sourceArtifactIds)},${client.json(a.sourceEnvelopeIds)},${client.json(a.sourceObservationIds)},${client.json(a.payloadFingerprints)},${a.observationCount},${a.earliestObservedAt},${a.latestObservedAt},${a.availableAt},${a.fingerprint},${a.recordedAt}) on conflict (authority_id) do nothing returning authority_id`;
    if (inserted.length) {
      for (const o of a.observations) await client`insert into public.intelligence_m5_daily_series_observations (authority_id,observation_ordinal,observation_id,source_artifact_id,source_envelope_id,source_observation_id,provider_external_record_id,provider_id,dataset_id,dataset_version,observed_at,available_at,close_atoms,price_scale,quote_unit,payload_fingerprint,observation_fingerprint) values (${a.authorityId},${o.ordinal},${o.observationId},${o.sourceArtifactId},${o.sourceEnvelopeId},${o.sourceObservationId},${o.providerExternalRecordId},${a.providerId},${a.datasetId},${a.datasetVersion},${o.observedAt},${o.availableAt},${o.closeValue.toString()},${o.priceScale},${o.quoteUnit},${o.payloadFingerprint},${o.observationFingerprint}) on conflict do nothing`;
      for (const d of [aggregate.historySpan, aggregate.volatility]) await client`insert into public.intelligence_m5_daily_series_derivations (authority_id,metric_kind,derivation_version,cadence_policy_version,rounding_version,value,unit,scale,observed_at,available_at,as_of,ordered_observation_ids,observation_count,return_count,fingerprint,recorded_at,earliest_observed_at,latest_observed_at,maximum_observed_gap,price_scale,quote_unit) values (${a.authorityId},${d.metricKind},${d.derivationVersion},${d.cadencePolicyVersion},${d.roundingVersion},${d.value.toString()},${d.unit},${d.scale},${d.observedAt},${d.availableAt},${d.asOf},${client.json(d.orderedObservationIds)},${d.observationCount},${d.returnCount},${d.fingerprint},${a.recordedAt},${d.earliestObservedAt},${d.latestObservedAt},${d.maximumObservedGap.toString()},${d.priceScale},${d.quoteUnit}) on conflict do nothing`;
    }
    const reread = await readById(a.authorityId);
    if (!reread || reread.authority.fingerprint !== a.fingerprint || reread.historySpan.fingerprint !== aggregate.historySpan.fingerprint || reread.volatility.fingerprint !== aggregate.volatility.fingerprint) throw new Error("M5_DAILY_REPOSITORY_CONFLICT");
    return reread;
  };
  return Object.freeze({ readById, save });
}

export function createM5DailySeriesAuthorityPersistenceUnitOfWork(sql: Sql): M5DailySeriesAuthorityUnitOfWork {
  return { withTransaction: <T>(work: (repositories: M5DailySeriesAuthorityRepositories) => Promise<T>) => sql.begin(async transaction => work(Object.freeze({ sourceLineage: createTransactionSourceLineageRepository(transaction), dailySeries: createM5DailySeriesAuthorityTransactionRepository(transaction) }))) as unknown as Promise<T> };
}
