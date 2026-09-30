import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import qualificationSourceConfig from "../../config/m5/coingecko-market-source-qualification.production.json";
import { M5_COINGECKO_REQUIRED_PROOFS, M5_COINGECKO_REQUIRED_SEMANTICS } from "@/domain/intelligence/m5-coingecko-market-source-qualification";
import type { ManualIngestionToLineageRepositories, ManualIngestionToLineageUnitOfWork } from "@/application/intelligence/manual-ingestion-to-lineage-uow";
import type { AvailabilityClaim, IngestionAttempt, LifecycleEvent, SourceArtifact, SourceEnvelope, SourceObservation } from "@/domain/intelligence/ingestion-provenance";
import type { SourceLineage, SourceLineageMember } from "@/domain/intelligence/source-lineage";

const now = "2026-09-25T12:00:00.000Z";
const expiry = "2027-09-25T12:00:00.000Z";
const registryModule = fileURLToPath(new URL("../../config/m5/provider-approval-authorities.production.json", import.meta.url));
const qualificationConfigModule = fileURLToPath(new URL("../../config/m5/coingecko-market-source-qualification.production.json", import.meta.url));

afterEach(() => {
  vi.doUnmock(registryModule);
  vi.doUnmock(qualificationConfigModule);
  vi.resetModules();
});

describe("M5 configured approval registry module replacement", () => {
  it("keeps the production registry default blocked for CoinGecko", async () => {
    vi.doUnmock(registryModule);
    vi.resetModules();
    const resolver = await import("@/application/intelligence/resolve-m5-provider-approval-authority");
    const result = resolver.resolveConfiguredM5ProviderApprovalAuthority({ approvalAuthorityId: "m5-provider-approval-authority:synthetic", approvalAuthorityFingerprint: "0".repeat(64), providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", asOf: now });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers).toContain("M5_APPROVAL_AUTHORITY_NOT_ALLOWLISTED");
    expect(resolver.isTrustedConfiguredM5ProviderApprovalAuthorityResolution(result)).toBe(false);
  });

  it("issues configured, module-local aggregate trust only from the replacement registry", async () => {
    vi.resetModules();
    const approval = (await import("@/domain/intelligence/m5-provider-approval-authority")).createM5ProviderApprovalAuthority({ contractVersion: "m5-provider-approval-authority/v1", policyVersion: "m5-provider-approval-policy/v1", authorityVersion: "test/v1", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", reviewedAt: now, effectiveFrom: now, expiresAt: expiry, recordedAt: now, usageDecisions: ["AUTHORITY_PERSISTENCE","COMMERCIAL_USE","NETWORK_ACQUISITION","NORMALIZED_STORAGE","RAW_PAYLOAD_PROCESSING","RAW_PAYLOAD_STORAGE","REDISTRIBUTION"].map(usage => ({ usage, decision: "APPROVED", evidence: [{ kind: "IDENTIFIER", value: "review/synthetic-approval/v1" }] })), retentionDecision: { decision: "APPROVED", evidence: [{ kind: "SHA256", value: "a".repeat(64) }] } });
    const registry = Object.freeze({ contractVersion: "m5-provider-approval-authority-registry/v1", entries: Object.freeze([{ approvalAuthorityId: approval.approvalAuthorityId, approvalAuthorityFingerprint: approval.approvalAuthorityFingerprint, providerId: approval.providerId, datasetId: approval.datasetId, datasetVersion: approval.datasetVersion }]), authorities: Object.freeze([approval]) });
    vi.doMock(registryModule, () => ({ default: registry }));
    const resolver = await import("@/application/intelligence/resolve-m5-provider-approval-authority");
    const aggregate = await import("@/application/intelligence/evaluate-m5-provider-readiness-aggregate");
    const readiness = await import("@/application/intelligence/evaluate-m5-provider-readiness");
    const config = { configVersion: "m5-provider-readiness-config/v1", providerNamespace: "test:coingecko", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", reviewedAt: now, reviewReference: "test/review", documentationUrls: ["https://docs.example.test"], termsUrls: ["https://terms.example.test"], capabilities: readiness.M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, status: "SUPPORTED", completeness: "COMPLETE", reviewedAt: now, reviewReference: "test/review", documentationUrls: ["https://docs.example.test"], termsUrls: ["https://terms.example.test"], limitations: [], ...(capability === "VENUE_COMPLETE_UNIVERSE" ? { zeroVenuePolicy: "ALLOWED_EMPTY" } : {}) })), usageDecisions: readiness.M5_DEFAULT_REQUESTED_USAGES.map(usage => ({ usage, approval: "APPROVED", reviewedAt: now, reviewReference: "test/review", limitations: [] })), limitations: [], approvalExpiresAt: expiry, metadata: { sourceKind: "SYNTHETIC_FIXTURE", policyVersion: "m5-provider-readiness-policy/v1" } };
    const evaluation = readiness.evaluateM5ProviderReadinessConfig({ config, evaluatedAt: now }); const source = { ...aggregate.bindM5ProviderReadinessAggregateSource(config, evaluation), approvalAuthorityId: approval.approvalAuthorityId, approvalAuthorityFingerprint: approval.approvalAuthorityFingerprint };
    const aggregateConfig = { contractVersion: "m5-provider-readiness-aggregate/v1", policyVersion: "m5-provider-readiness-aggregate-policy/v1", aggregateId: "test-aggregate", reviewedAt: now, reviewReference: "test/review", sources: [source], capabilityAssignments: readiness.M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, mode: "ALL_OF", sourceIds: [source.sourceId] })), usageDecisions: ["AUTHORITY_PERSISTENCE","COMMERCIAL_USE","NETWORK_ACQUISITION","NORMALIZED_STORAGE","RAW_PAYLOAD_PROCESSING","RAW_PAYLOAD_STORAGE","REDISTRIBUTION","RETENTION"].map(usage => ({ sourceId: source.sourceId, usage, approval: "APPROVED", reviewedAt: now, reviewReference: "test/review", approvalExpiresAt: expiry })) };
    const resolved = resolver.resolveConfiguredM5ProviderApprovalAuthority({ approvalAuthorityId: approval.approvalAuthorityId, approvalAuthorityFingerprint: approval.approvalAuthorityFingerprint, providerId: approval.providerId, datasetId: approval.datasetId, datasetVersion: approval.datasetVersion, asOf: now }); expect(resolver.isTrustedConfiguredM5ProviderApprovalAuthorityResolution(resolved)).toBe(true);
    const result = aggregate.evaluateM5ProviderReadinessAggregate({ config: aggregateConfig, sources: [{ sourceId: source.sourceId, config, evaluation }], evaluatedAt: now }); expect(result.result).toBe("READY"); expect(aggregate.isTrustedM5ProviderReadinessAggregate(result)).toBe(true); expect(aggregate.isTrustedM5ProviderReadinessAggregate({ ...result })).toBe(false); expect(aggregate.isTrustedM5ProviderReadinessAggregate(JSON.parse(JSON.stringify(result)))).toBe(false);
    vi.doUnmock(registryModule); vi.resetModules();
  });

  it("keeps the authentic acquisition result same-runtime-only through handoff", async () => {
    // The registry-replacement test above establishes the only supported way to
    // create a configured, evaluator-branded aggregate. This assertion protects
    // the handoff boundary itself without ever opening an execution boundary.
    vi.resetModules();
    const handoff = await import("@/application/intelligence/m5-coingecko-acquisition-ingestion-handoff");
    const uow = { withTransaction: vi.fn() };
    const lookalike = { status: "READY", authorityStatus: "NON_AUTHORITATIVE_SMOKE", providerId: "coingecko" };
    const result = await handoff.executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: lookalike, asOf: now, scope: {} as never, apply: true, unitOfWork: uow as never });
    expect(result).toEqual({ status: "BLOCKED", code: "M5_ACQUISITION_HANDOFF_UNTRUSTED_ACQUISITION" });
    expect(uow.withTransaction).not.toHaveBeenCalled();
  });

  it("runs a configured, authentic CoinGecko acquisition through the ingestion handoff", async () => {
    vi.resetModules();
    const approvalAuthority = await import("@/domain/intelligence/m5-provider-approval-authority");
    const approval = approvalAuthority.createM5ProviderApprovalAuthority({ contractVersion: "m5-provider-approval-authority/v1", policyVersion: "m5-provider-approval-policy/v1", authorityVersion: "test/v1", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", reviewedAt: now, effectiveFrom: now, expiresAt: expiry, recordedAt: now, usageDecisions: ["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION"].map(usage => ({ usage, decision: "APPROVED", evidence: [{ kind: "IDENTIFIER", value: "review/synthetic-approval/v1" }] })), retentionDecision: { decision: "APPROVED", evidence: [{ kind: "SHA256", value: "a".repeat(64) }] } });
    const registry = Object.freeze({ contractVersion: "m5-provider-approval-authority-registry/v1", entries: Object.freeze([{ approvalAuthorityId: approval.approvalAuthorityId, approvalAuthorityFingerprint: approval.approvalAuthorityFingerprint, providerId: approval.providerId, datasetId: approval.datasetId, datasetVersion: approval.datasetVersion }]), authorities: Object.freeze([approval]) });
    vi.doMock(registryModule, () => ({ default: registry }));
    const qualificationRegistry = JSON.parse(JSON.stringify(qualificationSourceConfig)) as { qualifications: Array<{ metric: string; documentedProviderSemantics: string[]; evidenceReferences: Array<{ claims: string[] }>; blockers: string[] }> };
    const syntheticDaily = qualificationRegistry.qualifications.find(item => item.metric === "DAILY_CLOSE_SERIES")!;
    const dailyProofs = M5_COINGECKO_REQUIRED_SEMANTICS.DAILY_CLOSE_SERIES.map(semantic => M5_COINGECKO_REQUIRED_PROOFS[semantic]!);
    syntheticDaily.documentedProviderSemantics = dailyProofs;
    syntheticDaily.evidenceReferences[0]!.claims = [...new Set([...syntheticDaily.evidenceReferences[0]!.claims, ...dailyProofs])];
    syntheticDaily.blockers = [];
    const syntheticMarketCap = qualificationRegistry.qualifications.find(item => item.metric === "MARKET_CAP")!;
    const marketCapProofs = M5_COINGECKO_REQUIRED_SEMANTICS.MARKET_CAP.map(semantic => M5_COINGECKO_REQUIRED_PROOFS[semantic]!);
    syntheticMarketCap.documentedProviderSemantics = marketCapProofs;
    syntheticMarketCap.evidenceReferences[0]!.claims = [...new Set([...syntheticMarketCap.evidenceReferences[0]!.claims, ...marketCapProofs])];
    syntheticMarketCap.blockers = [];
    const blockedVolume = qualificationRegistry.qualifications.find(item => item.metric === "VOLUME_24H")!;
    blockedVolume.documentedProviderSemantics = [];
    vi.doMock(qualificationConfigModule, () => ({ default: qualificationRegistry }));

    const resolver = await import("@/application/intelligence/resolve-m5-provider-approval-authority");
    const aggregateEvaluator = await import("@/application/intelligence/evaluate-m5-provider-readiness-aggregate");
    const readinessEvaluator = await import("@/application/intelligence/evaluate-m5-provider-readiness");
    const aggregateDomain = await import("@/domain/intelligence/m5-provider-readiness-aggregate");
    const acquisitionRuntime = await import("@/application/intelligence/m5-provider-live-acquisition");
    const handoff = await import("@/application/intelligence/m5-coingecko-acquisition-ingestion-handoff");
    const qualificationRuntime = await import("@/application/intelligence/resolve-m5-coingecko-market-source-qualification");
    const projectionGuard = await import("@/application/intelligence/qualify-m5-coingecko-market-projection");
    const sourceLineage = await import("@/domain/intelligence/source-lineage");

    const config = { configVersion: "m5-provider-readiness-config/v1", providerNamespace: "test:coingecko", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", reviewedAt: now, reviewReference: "test/review", documentationUrls: ["https://docs.example.test"], termsUrls: ["https://terms.example.test"], capabilities: readinessEvaluator.M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, status: "SUPPORTED", completeness: "COMPLETE", reviewedAt: now, reviewReference: "test/review", documentationUrls: ["https://docs.example.test"], termsUrls: ["https://terms.example.test"], limitations: [], ...(capability === "VENUE_COMPLETE_UNIVERSE" ? { zeroVenuePolicy: "ALLOWED_EMPTY" } : {}) })), usageDecisions: readinessEvaluator.M5_DEFAULT_REQUESTED_USAGES.map(usage => ({ usage, approval: "APPROVED", reviewedAt: now, reviewReference: "test/review", limitations: [] })), limitations: [], approvalExpiresAt: expiry, metadata: { sourceKind: "SYNTHETIC_FIXTURE", policyVersion: "m5-provider-readiness-policy/v1" } };
    const readiness = readinessEvaluator.evaluateM5ProviderReadinessConfig({ config, evaluatedAt: now, requiredCapabilities: [...readinessEvaluator.M5_DEFAULT_REQUIRED_CAPABILITIES].sort((left, right) => left.capability.localeCompare(right.capability)) });
    const source = { ...aggregateEvaluator.bindM5ProviderReadinessAggregateSource(config, readiness), approvalAuthorityId: approval.approvalAuthorityId, approvalAuthorityFingerprint: approval.approvalAuthorityFingerprint };
    const aggregateConfig = { contractVersion: "m5-provider-readiness-aggregate/v1", policyVersion: "m5-provider-readiness-aggregate-policy/v1", aggregateId: "test-aggregate", reviewedAt: now, reviewReference: "test/review", sources: [source], capabilityAssignments: readinessEvaluator.M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, mode: "ALL_OF", sourceIds: [source.sourceId] })), usageDecisions: ["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION", "RETENTION"].map(usage => ({ sourceId: source.sourceId, usage, approval: "APPROVED", reviewedAt: now, reviewReference: "test/review", approvalExpiresAt: expiry })) };
    const resolution = resolver.resolveConfiguredM5ProviderApprovalAuthority({ approvalAuthorityId: approval.approvalAuthorityId, approvalAuthorityFingerprint: approval.approvalAuthorityFingerprint, providerId: approval.providerId, datasetId: approval.datasetId, datasetVersion: approval.datasetVersion, asOf: now });
    expect(resolver.isTrustedConfiguredM5ProviderApprovalAuthorityResolution(resolution)).toBe(true);
    const aggregate = aggregateEvaluator.evaluateM5ProviderReadinessAggregate({ config: aggregateConfig, sources: [{ sourceId: source.sourceId, config, evaluation: readiness }], evaluatedAt: now });
    expect(aggregate.result).toBe("READY");
    expect(aggregateEvaluator.isTrustedM5ProviderReadinessAggregate(aggregate)).toBe(true);
    expect(aggregate.sources[0]?.readinessResultFingerprint).toBe(aggregateDomain.m5ProviderReadinessEvaluationIdentity(readiness).readinessResultFingerprint);

    const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    const sentinel = "m5-acquisition-credential-sentinel";
    const lease = vi.fn(async () => true);
    const credentialResolve = vi.fn(async () => ({ kind: "API_KEY" as const, value: sentinel }));
    const syntheticDays = Array.from({ length: 15 }, (_, index) => ({ timestamp: Date.UTC(2026, 0, index + 1), price: (9007199254740993n + BigInt(index)).toString() }));
    const syntheticResponse = `{"prices":[${syntheticDays.map(day => `[${day.timestamp},${day.price}]`).join(",")}],"market_caps":[${syntheticDays.map(day => `[${day.timestamp},1]`).join(",")}],"total_volumes":[${syntheticDays.map(day => `[${day.timestamp},2]`).join(",")}]}`;
    const send = vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: new TextEncoder().encode(syntheticResponse), retrievedAt: now }));
    const qualificationAsOf = "2026-10-01T00:00:00.000Z";
    const acquisition = await acquisitionRuntime.executeM5ProviderLiveAcquisition({ aggregate, readiness, request: { providerId: "coingecko", coinId: "ethereum", contractAddress: weth, from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z", datasetVersion: "coingecko-market-chart/range-v1" }, asOf: qualificationAsOf, currentTime: () => qualificationAsOf, credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" }, credentials: { resolve: credentialResolve }, transport: { send }, rateLimit: { acquire: lease }, requestedAt: now, startedAt: now, recordedAt: now, now: () => qualificationAsOf, monotonicNow: () => 0 });
    if (acquisition.status !== "READY") throw new Error(acquisition.code);
    expect(acquisition.status).toBe("READY");
    if (acquisition.status !== "READY" || !acquisition.ingestionHandoffBinding) throw new Error("fixture");

    const qualification = qualificationRuntime.resolveConfiguredM5CoinGeckoMarketSourceQualification("DAILY_CLOSE_SERIES").qualification!;
    expect(qualification.status).toBe("QUALIFIED");
    const projected = projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification, metric: "DAILY_CLOSE_SERIES", asOf: qualificationAsOf });
    expect(projected.status).toBe("PROJECTED");
    if (projected.status === "PROJECTED") expect(projected.points).toHaveLength(15);
    const qualifiedMarketCap = qualificationRuntime.resolveConfiguredM5CoinGeckoMarketSourceQualification("MARKET_CAP").qualification!;
    expect(qualifiedMarketCap.status).toBe("QUALIFIED");
    const capProjection = projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification: qualifiedMarketCap, metric: "MARKET_CAP", asOf: qualificationAsOf });
    expect(capProjection.status).toBe("PROJECTED");
    if (capProjection.status === "PROJECTED") expect(capProjection.points[0]).toMatchObject({ valueAtoms: "100", scale: 0, unit: "MINOR", sourceValueAtoms: "1", sourceScale: 0, quoteCurrency: "USD" });
    const blockedVolumeQualification = qualificationRuntime.resolveConfiguredM5CoinGeckoMarketSourceQualification("VOLUME_24H").qualification!;
    expect(blockedVolumeQualification.status).toBe("BLOCKED");
    const projectionWrites = vi.fn();
    const blockedProjection = projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification: blockedVolumeQualification, metric: "VOLUME_24H", asOf: qualificationAsOf });
    expect(blockedProjection).toMatchObject({ status: "BLOCKED", blocker: "M5_CG_PROJECTION_QUALIFICATION_NOT_QUALIFIED" });
    expect(blockedProjection.status === "BLOCKED" && blockedProjection.blockers).toContain("M5_VOLUME_EXACT_ROLLING_24H_WINDOW_NOT_DOCUMENTED");
    expect(projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification: blockedVolumeQualification, metric: "VOLUME_24H", asOf: qualificationAsOf, unitOfWork: { withTransaction: projectionWrites } })).toMatchObject({ status: "INVALID", blocker: "M5_CG_PROJECTION_REQUEST_INVALID" });
    const copiedQualification = { ...qualification };
    expect(projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification: copiedQualification, metric: "DAILY_CLOSE_SERIES", asOf: qualificationAsOf })).toMatchObject({ status: "BLOCKED", blocker: "M5_CG_PROJECTION_UNTRUSTED_QUALIFICATION" });
    const mismatchedFingerprint = { ...qualification, qualificationFingerprint: "f".repeat(64) };
    expect(projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification: mismatchedFingerprint, metric: "DAILY_CLOSE_SERIES", asOf: qualificationAsOf })).toMatchObject({ status: "BLOCKED", blocker: "M5_CG_PROJECTION_UNTRUSTED_QUALIFICATION" });
    expect(projectionGuard.qualifyM5CoinGeckoMarketProjection({ acquisition, qualification: blockedVolumeQualification, metric: "MARKET_CAP", asOf: qualificationAsOf })).toMatchObject({ status: "BLOCKED", blocker: "M5_CG_PROJECTION_SCOPE_OR_TIME_MISMATCH" });
    expect(projectionWrites).not.toHaveBeenCalled();

    const artifacts = new Map<string, SourceArtifact>(); const envelopes = new Map<string, SourceEnvelope>(); const observations = new Map<string, SourceObservation>(); const claims = new Map<string, AvailabilityClaim>(); const attempts = new Map<string, IngestionAttempt>(); const events: LifecycleEvent[] = []; let lineage: SourceLineage | undefined; let members: readonly SourceLineageMember[] = [];
    const repositories: ManualIngestionToLineageRepositories = {
      requests: { save: async value => value, readById: async () => undefined },
      attempts: { save: async value => { attempts.set(value.ingestionAttemptId, value); return value; }, readById: async id => attempts.get(id) },
      events: { save: async value => { events.push(value); return value; }, readByAttempt: async () => events },
      artifacts: { save: async value => { artifacts.set(value.sourceArtifactId, value); return value; }, readById: async id => artifacts.get(id) },
      envelopes: { save: async value => { envelopes.set(value.sourceEnvelopeId, value); return value; }, readById: async id => envelopes.get(id) },
      observations: { save: async value => { observations.set(value.sourceObservationId, value); return value; }, readById: async id => observations.get(id), readByArtifact: async () => [] },
      availabilityClaims: { save: async value => { claims.set(value.availabilityClaimId, value); return value; }, readById: async id => claims.get(id) },
      sourceLineage: { createFromClaims: async (scope, claimIds, recordedAt) => { const built = sourceLineage.createSourceLineage({ ...scope, recordedAt, members: claimIds.map(id => { const claim = claims.get(id)!; const observation = observations.get(claim.sourceObservationId)!; const envelope = envelopes.get(claim.sourceEnvelopeId)!; const artifact = artifacts.get(observation.sourceArtifactId)!; return { claim, observation, envelope, artifact, attempt: attempts.get(observation.ingestionAttemptId)!, lifecycleStatus: "COMPLETED" as const }; }) }); lineage = built.lineage; members = built.members; return lineage; }, readById: async () => lineage, readMembers: async () => members },
    };
    const withTransaction = vi.fn();
    const uow: ManualIngestionToLineageUnitOfWork = { withTransaction: async <T>(work: (value: ManualIngestionToLineageRepositories) => Promise<T>) => { withTransaction(); return work(repositories); } };
    const result = await handoff.executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition, asOf: qualificationAsOf, scope: acquisition.ingestionHandoffBinding, apply: true, unitOfWork: uow });
    if (result.status !== "READY") throw new Error(result.code);
    expect(result.status).toBe("READY");
    expect(send).toHaveBeenCalledTimes(1);
    expect(lease).toHaveBeenCalledTimes(1);
    expect(credentialResolve).toHaveBeenCalledTimes(1);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(acquisition.scope).toEqual({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1" });
    expect(acquisition.ingestionHandoffBinding).toMatchObject({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", chain: "ethereum", contractAddress: weth });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    vi.doUnmock(registryModule); vi.resetModules();
  });
});
