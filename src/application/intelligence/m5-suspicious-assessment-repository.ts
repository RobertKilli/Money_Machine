import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { SuspiciousEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { SourceLineage, SourceLineageMember } from "@/domain/intelligence/source-lineage";
import type { M5SuspiciousAssessment, M5SuspiciousFindingReference } from "@/domain/intelligence/m5-suspicious-assessment";
import type { M5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";

export interface M5SuspiciousAssessmentRepository {
  readonly save: (assessment: M5SuspiciousAssessment) => Promise<M5SuspiciousAssessment>;
  readonly readById: (assessmentId: string) => Promise<M5SuspiciousAssessment | undefined>;
  readonly readSealedById: (assessmentId: string) => Promise<Readonly<{ assessment: M5SuspiciousAssessment; members: readonly M5SuspiciousFindingReference[] }> | undefined>;
}
export interface M5SuspiciousAssessmentReadCapability {
  readonly readById: (assessmentId: string) => Promise<M5SuspiciousAssessment | undefined>;
  readonly readSealedById: (assessmentId: string) => Promise<Readonly<{ assessment: M5SuspiciousAssessment; members: readonly M5SuspiciousFindingReference[] }> | undefined>;
}

export interface M5SuspiciousAssessmentMembershipRepository {
  readonly save: (assessment: M5SuspiciousAssessment, members: readonly M5SuspiciousFindingReference[]) => Promise<readonly M5SuspiciousFindingReference[]>;
  readonly readByAssessmentId: (assessmentId: string) => Promise<readonly M5SuspiciousFindingReference[]>;
}

export interface M5SuspiciousFindingAuthorityReader {
  readonly readExact: (scope: Readonly<{
    providerId: string;
    datasetId: string;
    datasetVersion: string;
    candidateId: string;
    assetId: string;
    canonicalIdentifier: string;
    assetClass: string;
    mappingRevisionId: string;
    sourceLineageId: string;
    asOf: string;
    pins: readonly { providerId: string; datasetId: string; datasetVersion: string }[];
  }>) => Promise<readonly SuspiciousEligibilityEvidence[]>;
}

export interface M5SuspiciousAssessmentRepositories {
  readonly assessments: M5SuspiciousAssessmentRepository;
  readonly memberships: M5SuspiciousAssessmentMembershipRepository;
  readonly findings: M5SuspiciousFindingAuthorityReader;
  readonly mappings: Readonly<{ readById: (id: string) => Promise<AssetMappingRevision | undefined> }>;
  readonly lineages: Readonly<{ validateForRawEvidenceCreation: (id: string) => Promise<SourceLineage>; readMembers: (id: string) => Promise<readonly SourceLineageMember[]> }>;
  readonly ruleSets: M5SuspiciousRuleSetAuthorityResolver;
}

export interface M5SuspiciousAssessmentUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: M5SuspiciousAssessmentRepositories) => Promise<T>) => Promise<T>;
}

export type CreateM5SuspiciousAssessmentRequest = Readonly<{
  result: M5SuspiciousAssessment["result"];
  ruleSetVersion: string;
  detectorVersion: string;
  asOf: string;
  recordedAt: string;
  candidateId: string;
  assetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  mappingRevisionId: string;
  sourceLineageId: string;
  findingEvidenceIds: readonly string[];
}>;
