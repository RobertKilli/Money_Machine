import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { createM5SuspiciousRuleSetAuthority, createM5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";
import { executeManualIngestionToLineage, buildManualIngestionToLineagePlan } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createProviderAssetIdentityAssertionAuthority } from "@/application/intelligence/create-provider-asset-identity-assertion";
import { createProviderAssetIdentityAssertionUnitOfWork } from "@/infrastructure/postgres/provider-asset-identity-repository";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createAssetMappingSourceLineageUnitOfWork } from "@/infrastructure/postgres/asset-mapping-revision-repository";
import { createM5SuspiciousCoveragePersistenceUnitOfWork } from "@/infrastructure/postgres/m5-suspicious-coverage-repository";
import { createM5SuspiciousAssessmentUnitOfWork } from "@/infrastructure/postgres/m5-suspicious-assessment-repository";
import { persistM5SuspiciousAssessmentWithCoverage } from "@/application/intelligence/create-m5-suspicious-assessment";
import { createRawEligibilityEvidenceFromMapping } from "@/application/intelligence/create-raw-eligibility-evidence-from-mapping";
import { createRawEvidenceUnitOfWork } from "@/infrastructure/postgres/eligibility-evidence-repository";
import { createAgeReferenceEligibilityEvidence, createQuantitativeEligibilityEvidence, createVenueEligibilityEvidence, type RawEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import { M5_EVIDENCE_MANIFEST_VERSION, type M5EvidenceManifest, type M5EvidenceSemanticCompatibility } from "@/application/intelligence/assemble-m5-evidence";
import { provisionM5ManifestAuthority } from "@/application/intelligence/provision-m5-manifest-authority";
import { createM5ManifestAuthorityRepository } from "@/infrastructure/postgres/m5-manifest-authority-repository";
import { createM5SuspiciousAssessmentReadRepository } from "@/infrastructure/postgres/m5-suspicious-assessment-repository";
import { createCanonicalM5ProducerFromAuthority } from "@/application/intelligence/produce-canonical-m5-from-authority";
import { persistCanonicalM5Eligibility } from "@/application/intelligence/persist-canonical-evidence";

const url = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_SUSPICIOUS_COVERAGE_INTEGRATION === "1" && Boolean(url);
const assertLocal = (value: string) => { const host = new URL(value).hostname; if (!(host === "localhost" || host === "127.0.0.1" || host === "::1")) throw new Error("M5_SUSPICIOUS_INTEGRATION_REQUIRES_LOOPBACK"); };
const observedAt = "2026-02-01T00:00:00.000Z";
const asOf = "2026-02-02T00:00:00.000Z";

const compatibility = (): M5EvidenceSemanticCompatibility => ({ version: "m5-compatibility/v1", permittedAgeBases: ["ASSET_INCEPTION"], ageCalculationVersion: "age-days/v1", historySpanSemanticsVersions: ["history/v1"], historySpanQualificationBases: ["QUALIFYING"], volatilitySemanticsVersions: ["volatility/v1"], monetaryCurrency: "USD", monetaryUnit: "MINOR", monetaryScale: 0, liquiditySemanticsVersions: ["monetary/v1"], volumeSemanticsVersions: ["monetary/v1"], marketCapSemanticsVersions: ["monetary/v1"] });
const evidenceRef = (value: RawEligibilityEvidence) => ({ evidenceId: value.evidenceId, fingerprint: value.fingerprint });

function producerRaw(assessment: { readonly candidateId: string; readonly assetId: string; readonly canonicalIdentifier: string; readonly assetClass: string; readonly providerId: string; readonly datasetId: string; readonly datasetVersion: string; readonly mappingRevisionId: string; readonly sourceLineageId: string; readonly observedAt: string; readonly availableAt: string; readonly asOf: string; readonly sourceRecordIds: readonly string[]; readonly payloadFingerprint: string }, suffix: string, finding?: RawEligibilityEvidence): readonly RawEligibilityEvidence[] {
  const base = (overrides: Record<string, unknown> = {}) => ({ evidenceId: `${String(overrides.evidenceId ?? "evidence")}-${suffix}`, candidateId: assessment.candidateId, assetId: assessment.assetId, canonicalIdentifier: assessment.canonicalIdentifier, assetClass: assessment.assetClass, providerId: assessment.providerId, datasetId: assessment.datasetId, datasetVersion: assessment.datasetVersion, mappingRevisionId: assessment.mappingRevisionId, sourceLineageId: assessment.sourceLineageId, observedAt: assessment.observedAt, availableAt: assessment.availableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: assessment.sourceRecordIds, payloadFingerprint: assessment.payloadFingerprint }, ...overrides });
  const metric = (evidenceId: string, metricKind: string, valueAtoms: bigint, extra: Record<string, unknown> = {}) => createQuantitativeEligibilityEvidence(base({ evidenceId, metricKind, valueAtoms, scale: 0, unit: metricKind === "HISTORY_SPAN" ? "DAYS" : metricKind === "VOLATILITY" || metricKind.includes("CONCENTRATION") ? "BPS" : "MINOR", semanticsVersion: metricKind === "HISTORY_SPAN" ? "history/v1" : metricKind === "VOLATILITY" ? "volatility/v1" : "monetary/v1", currencyCode: ["LIQUIDITY", "VOLUME", "MARKET_CAP"].includes(metricKind) ? "USD" : undefined, qualificationBasis: metricKind === "HISTORY_SPAN" ? "QUALIFYING" : undefined, window: metricKind === "MARKET_CAP" || metricKind.includes("CONCENTRATION") ? undefined : { startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-01-02T00:00:00.000Z" }, ...(metricKind === "HISTORY_SPAN" || metricKind === "VOLATILITY" ? { dailySeriesAuthorityId: `daily-authority-${suffix}`, dailySeriesAuthorityFingerprint: "d".repeat(64), dailySeriesDerivationFingerprint: "e".repeat(64), asOf: assessment.asOf } : {}), ...(metricKind.includes("CONCENTRATION") ? { holderSnapshotId: `holder-${suffix}`, holderSnapshotFingerprint: "b".repeat(64), holderDerivationFingerprint: "c".repeat(64), asOf: assessment.asOf } : {}), ...(metricKind === "LIQUIDITY" || metricKind === "VOLUME" || metricKind === "MARKET_CAP" ? { marketMetricsAuthorityId: `market-${suffix}`, marketMetricsAuthorityFingerprint: "f".repeat(64), marketMetricsDerivationFingerprint: "a".repeat(64), asOf: assessment.asOf } : {}), ...extra }) as never);
  const age = createAgeReferenceEligibilityEvidence(base({ evidenceId: "age", referenceKind: "ASSET_INCEPTION", ageBasis: "ASSET_INCEPTION", referenceAt: "2025-12-01T00:00:00.000Z" }) as never);
  const history = metric("history", "HISTORY_SPAN", 14n);
  const liquidity = metric("liquidity", "LIQUIDITY", 1_000_000n);
  const volume = metric("volume", "VOLUME", 500_000n);
  const marketCap = metric("market-cap", "MARKET_CAP", 10_000_000n);
  const top10 = metric("top10", "TOP10_CONCENTRATION", 8_000n);
  const single = metric("single", "SINGLE_CONCENTRATION", 3_000n);
  const volatility = metric("volatility", "VOLATILITY", 20_000n);
  const venueA = createVenueEligibilityEvidence(base({ evidenceId: "venue-a", venueId: "venue-a", eligibilityState: "ELIGIBLE", venueAuthorityId: `venue-authority-${suffix}`, venueAuthorityFingerprint: "1".repeat(64), venueMemberId: "venue-a", venueMemberFingerprint: "2".repeat(64), venueAuthorityMemberCount: 2, asOf: assessment.asOf }) as never);
  const venueB = createVenueEligibilityEvidence(base({ evidenceId: "venue-b", venueId: "venue-b", eligibilityState: "ELIGIBLE", venueAuthorityId: `venue-authority-${suffix}`, venueAuthorityFingerprint: "1".repeat(64), venueMemberId: "venue-b", venueMemberFingerprint: "3".repeat(64), venueAuthorityMemberCount: 2, asOf: assessment.asOf }) as never);
  return Object.freeze([age, history, liquidity, volume, marketCap, top10, single, volatility, venueA, venueB, ...(finding ? [finding] : [])]);
}

function manifestFor(raw: readonly RawEligibilityEvidence[], assessment: { readonly suspiciousAssessmentId: string; readonly fingerprint: string }): M5EvidenceManifest {
  const byKind = (kind: string) => { const value = raw.find(item => item.evidenceKind === kind && (kind !== "QUANTITATIVE" || true)); if (!value) throw new Error(`M5_TEST_MISSING_${kind}`); return value; };
  const metric = (kind: string) => { const value = raw.find(item => item.evidenceKind === "QUANTITATIVE" && item.metricKind === kind); if (!value) throw new Error(`M5_TEST_MISSING_${kind}`); return evidenceRef(value); };
  return { version: M5_EVIDENCE_MANIFEST_VERSION, age: evidenceRef(byKind("REFERENCE")), historySpan: metric("HISTORY_SPAN"), liquidity: metric("LIQUIDITY"), volume: metric("VOLUME"), marketCap: metric("MARKET_CAP"), top10HolderConcentration: metric("TOP10_CONCENTRATION"), singleHolderConcentration: metric("SINGLE_CONCENTRATION"), volatility: metric("VOLATILITY"), contractVerification: undefined, venues: raw.filter(value => value.evidenceKind === "VENUE").map(evidenceRef), suspiciousAssessment: { assessmentId: assessment.suspiciousAssessmentId, fingerprint: assessment.fingerprint } };
}

function packageValue(idempotencyKey: string) {
  const records = [0, 1].map(index => {
    const envelope = { kind: "synthetic-suspicious", index };
    const selected = { record: `record-${index}` };
    const retrievedAt = `2026-02-01T00:0${index + 1}:00.000Z`;
    return { providerExternalRecordId: `record-${index}`, providerRevision: "fixture/v1", payloadFingerprint: canonicalSha256({ envelope, selected }), pageOrdinal: 0, itemOrdinal: index, retrievedAt, recordedAt: asOf, observedAt, normalizedEnvelope: envelope, selectedAuditableFields: selected, metadata: { cursorSafety: "NONE" } };
  });
  return { contractVersion: "m5-normalized-source-package/v1", idempotencyKey, providerId: "synthetic-suspicious", datasetId: "synthetic-suspicious-dataset", datasetVersion: "synthetic/v1", providerSourceNamespace: "synthetic", adapterContractVersion: "fixture/v1", adapterVersion: "fixture/v1", parserContractVersion: "normalized/v1", parserVersion: "normalized/v1", envelopeSchemaVersion: "fixture-envelope/v1", attemptNumber: 1, requestedAt: observedAt, startedAt: observedAt, recordedAt: asOf, requestScope: { scope: "local" }, provenance: { system: "fixture" }, executionInput: { fixture: true }, records };
}

describe.skipIf(!enabled)("M5 suspicious coverage PostgreSQL integration", () => {
  it("persists coverage and assessment atomically, replays, and rolls back", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 1, prepare: true });
    try {
      await sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values ('synthetic-suspicious','synthetic-suspicious','SYNTHETIC_FIXTURE','local','provenance/v1','METADATA_ONLY') on conflict do nothing`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values ('synthetic-suspicious-dataset','synthetic-suspicious','synthetic/v1','local','METADATA_ONLY') on conflict do nothing`;
      const plan = buildManualIngestionToLineagePlan(packageValue("suspicious-runtime"));
      const ingested = await executeManualIngestionToLineage(plan.package, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) });
      expect(ingested.status).toBe("PERSISTED");
      if (ingested.status !== "PERSISTED") return;
      const first = plan.records[0]!;
      const assertion = await createProviderAssetIdentityAssertionAuthority({ unitOfWork: createProviderAssetIdentityAssertionUnitOfWork(sql), projection: { projectionVersion: "m5-provider-asset-identity-projection/v1", sourceArtifactId: first.artifact.sourceArtifactId, sourceEnvelopeId: first.envelope.sourceEnvelopeId, parserVersion: plan.package.parserVersion, envelopeSchemaVersion: plan.package.envelopeSchemaVersion, identity: { type: "EVM_CONTRACT_ADDRESS", namespace: "eip155:1", value: "0x" + "1".repeat(40) }, diagnostics: [] }, recordedAt: asOf });
      const mapping = await createAssetMappingRevisionFromSourceLineage({ unitOfWork: createAssetMappingSourceLineageUnitOfWork(sql), value: { sourceLineageId: ingested.sourceLineageId, providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, canonicalAssetId: "canonical-suspicious", canonicalIdentifier: "asset:suspicious", assetClass: "CRYPTO", mappingRevisionVersion: "mapping/v1", validFrom: observedAt, recordedAt: asOf } });
      const ruleSet = createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: "rules/v1", providerId: plan.package.providerId, datasetId: plan.package.datasetId, datasetVersion: plan.package.datasetVersion, detectorVersion: "detector/v1", requiredRuleIds: ["RULE_A", "RULE_B"] });
      await createM5SuspiciousCoveragePersistenceUnitOfWork(sql).withTransaction(async repositories => repositories.ruleSets.save(ruleSet));
      const materials = plan.records.map(record => ({ materialId: record.artifact.sourceArtifactId, artifactId: record.artifact.sourceArtifactId, envelopeId: record.envelope.sourceEnvelopeId, observationId: record.observation.sourceObservationId, payloadFingerprint: record.artifact.payloadFingerprint, observedAt: record.envelope.observedAt, availableAt: record.observation.retrievedAt }));
      const resolver = createM5SuspiciousRuleSetAuthorityResolver([ruleSet]);
      const uow = createM5SuspiciousAssessmentUnitOfWork(sql, resolver);
      const request = { result: "NO_FINDINGS" as const, ruleSetVersion: ruleSet.ruleSetVersion, detectorVersion: ruleSet.detectorVersion, ruleSetAuthorityId: ruleSet.ruleSetAuthorityId, asOf, recordedAt: asOf, candidateId: "candidate-clean", assetId: mapping.canonicalAssetId, canonicalIdentifier: mapping.canonicalIdentifier, assetClass: mapping.assetClass, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: ingested.sourceLineageId, findingEvidenceIds: [] };
      const firstAssessment = await persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: uow, request, evaluation: { evaluatedRuleIds: ruleSet.requiredRuleIds, materials } });
      expect(firstAssessment.result).toBe("NO_FINDINGS");
      const replay = await persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: uow, request, evaluation: { evaluatedRuleIds: ruleSet.requiredRuleIds, materials } });
      expect(replay).toEqual(firstAssessment);
      const counts = async () => (await sql`select (select count(*) from public.m5_suspicious_rule_set_authorities)::int as rulesets,(select count(*) from public.m5_suspicious_rule_set_rules)::int as rules,(select count(*) from public.m5_suspicious_coverage_authorities)::int as coverage,(select count(*) from public.m5_suspicious_coverage_rule_inputs)::int as inputs,(select count(*) from public.eligibility_suspicious_assessments)::int as assessments`)[0];
      const stable = await counts();
      expect(stable).toEqual({ rulesets: 1, rules: 2, coverage: 1, inputs: 2, assessments: 1 });
      const finding = await createRawEligibilityEvidenceFromMapping({ unitOfWork: createRawEvidenceUnitOfWork(sql), value: { family: "SUSPICIOUS", evidenceId: "suspicious-runtime-finding", candidateId: "candidate-findings", mappingRevisionId: mapping.mappingRevisionId, payload: { flagCode: "RULE_A", severity: "HIGH", sourceSignalId: "signal-a" } } });
      const suspiciousRequest = { ...request, candidateId: "candidate-findings", result: "FINDINGS_PRESENT" as const, findingEvidenceIds: [finding.evidenceId] };
      const suspicious = await persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: uow, request: suspiciousRequest, evaluation: { evaluatedRuleIds: ruleSet.requiredRuleIds, materials } });
      expect(suspicious.result).toBe("FINDINGS_PRESENT");
      expect(suspicious.findingReferences).toHaveLength(1);
      expect((await counts()).assessments).toBe(2);
      const suspiciousReplay = await persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: uow, request: suspiciousRequest, evaluation: { evaluatedRuleIds: ruleSet.requiredRuleIds, materials } });
      expect(suspiciousReplay).toEqual(suspicious);
      const stableAfterFlows = await counts();
      expect(stableAfterFlows).toEqual({ rulesets: 1, rules: 2, coverage: 2, inputs: 4, assessments: 2 });
      const rollbackFinding = await createRawEligibilityEvidenceFromMapping({ unitOfWork: createRawEvidenceUnitOfWork(sql), value: { family: "SUSPICIOUS", evidenceId: "suspicious-runtime-rollback-finding", candidateId: "candidate-rollback-finding", mappingRevisionId: mapping.mappingRevisionId, payload: { flagCode: "RULE_A", severity: "HIGH", sourceSignalId: "signal-rollback" } } });
      const rollbackCoverageUow = { withTransaction: <T>(work: Parameters<typeof uow.withTransaction>[0]) => uow.withTransaction(async repositories => work({ ...repositories, coverage: { ...repositories.coverage!, save: async authority => { await repositories.coverage!.save!(authority); throw new Error("M5_TEST_SUSPICIOUS_COVERAGE_AFTER_WRITE"); } } })) as Promise<T> };
      await expect(persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: rollbackCoverageUow, request: { ...request, candidateId: "candidate-rollback-coverage" }, evaluation: { evaluatedRuleIds: ruleSet.requiredRuleIds, materials } })).rejects.toThrow("M5_TEST_SUSPICIOUS_COVERAGE_AFTER_WRITE");
      const rollbackAssessmentUow = { withTransaction: <T>(work: Parameters<typeof uow.withTransaction>[0]) => uow.withTransaction(async repositories => work({ ...repositories, memberships: { ...repositories.memberships, save: async (assessment, members) => { const result = await repositories.memberships.save(assessment, members); throw new Error("M5_TEST_SUSPICIOUS_FINDING_AFTER_WRITE"); return result; } } })) as Promise<T> };
      await expect(persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: rollbackAssessmentUow, request: { ...suspiciousRequest, candidateId: "candidate-rollback-finding", findingEvidenceIds: [rollbackFinding.evidenceId] }, evaluation: { evaluatedRuleIds: ruleSet.requiredRuleIds, materials } })).rejects.toThrow("M5_TEST_SUSPICIOUS_FINDING_AFTER_WRITE");
      expect(await counts()).toEqual(stableAfterFlows);

      const persistedResolver = { resolve: async (scope: Parameters<typeof resolver.resolve>[0]) => {
        const stored = await createM5SuspiciousCoveragePersistenceUnitOfWork(sql).withTransaction(repositories => repositories.ruleSets.readById(ruleSet.ruleSetAuthorityId));
        return stored && stored.providerId === scope.providerId && stored.datasetId === scope.datasetId && stored.datasetVersion === scope.datasetVersion && stored.ruleSetVersion === scope.ruleSetVersion && stored.detectorVersion === scope.detectorVersion ? stored : undefined;
      } };
      const assessmentRead = createM5SuspiciousAssessmentReadRepository(sql as never, persistedResolver);
      const manifestRepository = createM5ManifestAuthorityRepository(sql);
      const canonicalRows = async () => (await sql`select count(*)::int as count from public.canonical_m5_eligibility_evaluations`)[0]!.count as number;
      const runBoundary = async (assessment: typeof firstAssessment, finding?: RawEligibilityEvidence) => {
        const raw = producerRaw(assessment, assessment.result === "NO_FINDINGS" ? "clean" : "findings", finding);
        const manifest = manifestFor(raw, assessment);
        const sourceContext = { candidateId: assessment.candidateId, assetId: assessment.assetId, canonicalIdentifier: assessment.canonicalIdentifier, assetClass: assessment.assetClass, asOf: assessment.asOf, providerDatasetPins: [{ providerId: assessment.providerId, datasetVersion: assessment.datasetVersion }], relevantEvidence: [] } as const;
        const config = { configVersion: "m5-manifest-authority-config/v1" as const, sourceContext, authorityVersion: "m5-runtime-manifest/v1", manifest, compatibility: compatibility(), allowedDatasetPins: [{ providerId: assessment.providerId, datasetId: assessment.datasetId, datasetVersion: assessment.datasetVersion }] };
        const applied = await provisionM5ManifestAuthority(config, "APPLY", { rawEvidenceRepository: { readAt: async () => raw }, authorityRepository: manifestRepository, suspiciousAssessmentRepository: assessmentRead, suspiciousRuleSetResolver: persistedResolver });
        expect(applied.status).toBe("APPLIED");
        if (applied.status !== "APPLIED") throw new Error("M5_TEST_MANIFEST_NOT_APPLIED");
        const persisted = createCanonicalM5ProducerFromAuthority({ authorityRepository: manifestRepository, producerDependencies: { rawEvidenceRepository: { readAt: async () => raw }, suspiciousAssessmentRepository: assessmentRead, suspiciousRuleSetResolver: persistedResolver, persistCanonicalM5: async input => persistCanonicalM5Eligibility(input) } });
        const result = await persisted({ manifestAuthorityId: applied.preview.manifestAuthorityId, sourceContext });
        expect(result.status).toBe("PERSISTED");
        if (result.status !== "PERSISTED") throw new Error("M5_TEST_CANONICAL_NOT_PERSISTED");
        expect(result.evaluatorResult.status).toBe(assessment.result === "NO_FINDINGS" ? "ELIGIBLE" : "INELIGIBLE");
        return { result, manifestAuthorityId: applied.preview.manifestAuthorityId, sourceContext, raw };
      };
      const cleanBoundary = await runBoundary(firstAssessment);
      expect(cleanBoundary.result.status === "PERSISTED" && cleanBoundary.result.canonicalInput.suspiciousEvidenceStatus).toBe("CLEAN");
      const suspiciousBoundary = await runBoundary(suspicious, finding);
      expect(suspiciousBoundary.result.status === "PERSISTED" && suspiciousBoundary.result.canonicalInput.suspiciousEvidenceStatus).toBe("SUSPICIOUS");
      expect(await sql`select count(*)::int as count from public.m5_manifest_authorities` .then(rows => rows[0]!.count)).toBe(2);
      expect(await canonicalRows()).toBe(2);
      const canonicalBindings = await sql`select suspicious_assessment_result as result,suspicious_evidence_status as status from public.canonical_m5_eligibility_evaluations order by suspicious_assessment_id`;
      expect(canonicalBindings.map(row => [row.result, row.status])).toEqual([["NO_FINDINGS", "CLEAN"], ["FINDINGS_PRESENT", "SUSPICIOUS"]]);

      const cleanReplay = await runBoundary(firstAssessment);
      const suspiciousReplayBoundary = await runBoundary(suspicious, finding);
      expect(cleanReplay.result).toEqual(cleanBoundary.result);
      expect(suspiciousReplayBoundary.result).toEqual(suspiciousBoundary.result);
      expect(await canonicalRows()).toBe(2);

      let evaluatorCalls = 0;
      let canonicalCalls = 0;
      const authority = await manifestRepository.readById(cleanBoundary.manifestAuthorityId);
      const guardedProducer = createCanonicalM5ProducerFromAuthority({ authorityRepository: { readById: async () => authority }, producerDependencies: { rawEvidenceRepository: { readAt: async () => cleanBoundary.raw }, suspiciousAssessmentRepository: { readSealedById: async () => { evaluatorCalls += 1; return undefined; }, readById: async () => undefined }, suspiciousRuleSetResolver: persistedResolver, persistCanonicalM5: async () => { canonicalCalls += 1; } } });
      const missingAssessment = await guardedProducer({ manifestAuthorityId: cleanBoundary.manifestAuthorityId, sourceContext: cleanBoundary.sourceContext });
      expect(missingAssessment.status).toBe("INCOMPLETE");
      expect(evaluatorCalls).toBe(1);
      expect(canonicalCalls).toBe(0);
      const badManifest = await manifestRepository.readById(cleanBoundary.manifestAuthorityId);
      const invalid = await createCanonicalM5ProducerFromAuthority({ authorityRepository: { readById: async () => ({ ...badManifest, manifest: { ...badManifest.manifest, suspiciousAssessment: { ...badManifest.manifest.suspiciousAssessment, fingerprint: "f".repeat(64) } } }) }, producerDependencies: { rawEvidenceRepository: { readAt: async () => cleanBoundary.raw }, suspiciousAssessmentRepository: assessmentRead, suspiciousRuleSetResolver: persistedResolver, persistCanonicalM5: async () => { canonicalCalls += 1; } } })({ manifestAuthorityId: cleanBoundary.manifestAuthorityId, sourceContext: cleanBoundary.sourceContext });
      expect(["INVALID_ASSEMBLY", "INCOMPLETE"]).toContain(invalid.status);
      expect(canonicalCalls).toBe(0);
      const incompleteAssessmentProducer = createCanonicalM5ProducerFromAuthority({ authorityRepository: manifestRepository, producerDependencies: { rawEvidenceRepository: { readAt: async () => cleanBoundary.raw }, suspiciousAssessmentRepository: { readSealedById: async () => ({ assessment: { ...firstAssessment, coverageStatus: undefined, ruleSetAuthorityId: undefined, coverageAuthorityId: undefined, coverageFingerprint: undefined, evaluatedRuleCount: undefined } as never, members: [] }), readById: async () => undefined }, suspiciousRuleSetResolver: persistedResolver, persistCanonicalM5: async () => { canonicalCalls += 1; } } });
      const incompleteCoverage = await incompleteAssessmentProducer({ manifestAuthorityId: cleanBoundary.manifestAuthorityId, sourceContext: cleanBoundary.sourceContext });
      expect(incompleteCoverage.status).toBe("INCOMPLETE");
      expect(canonicalCalls).toBe(0);
      const dbFailure = createCanonicalM5ProducerFromAuthority({ authorityRepository: manifestRepository, producerDependencies: { rawEvidenceRepository: { readAt: async () => cleanBoundary.raw }, suspiciousAssessmentRepository: { readSealedById: async () => { throw new Error("M5_TEST_ASSESSMENT_DB_FAILURE"); }, readById: async () => undefined }, suspiciousRuleSetResolver: persistedResolver, persistCanonicalM5: async () => { canonicalCalls += 1; } } });
      await expect(dbFailure({ manifestAuthorityId: cleanBoundary.manifestAuthorityId, sourceContext: cleanBoundary.sourceContext })).rejects.toThrow("M5_TEST_ASSESSMENT_DB_FAILURE");
      expect(canonicalCalls).toBe(0);
    } finally { await sql.end({ timeout: 5 }); }
  });
});
