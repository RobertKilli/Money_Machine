import type { M5SuspiciousCoverageAuthority } from "@/domain/intelligence/m5-suspicious-coverage";
import type { M5SuspiciousRuleSetAuthority } from "@/domain/intelligence/m5-suspicious-rule-set";

export interface M5SuspiciousRuleSetAuthorityRepository {
  readonly readById: (id: string) => Promise<M5SuspiciousRuleSetAuthority | undefined>;
  readonly save: (authority: M5SuspiciousRuleSetAuthority) => Promise<M5SuspiciousRuleSetAuthority>;
}
export interface M5SuspiciousCoverageAuthorityRepository {
  readonly readById: (id: string) => Promise<M5SuspiciousCoverageAuthority | undefined>;
  readonly save: (authority: M5SuspiciousCoverageAuthority) => Promise<M5SuspiciousCoverageAuthority>;
}
export interface M5SuspiciousCoveragePersistenceUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: Readonly<{ ruleSets: M5SuspiciousRuleSetAuthorityRepository; coverage: M5SuspiciousCoverageAuthorityRepository }>) => Promise<T>) => Promise<T>;
}
