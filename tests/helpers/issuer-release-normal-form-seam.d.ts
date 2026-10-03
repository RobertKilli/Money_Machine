declare module "test-only:issuer-release-normal-form" {
  import type { SyntheticIssuerReleaseInput } from "@/domain/intelligence/event-intelligence-issuer-attributed-release-source-qualification";
  export function constructSyntheticNormalForm(input: unknown): SyntheticIssuerReleaseInput | null;
  export function checkFingerprintCollision(items: readonly Readonly<{ fingerprint: string; material: unknown }>[]): boolean;
}
