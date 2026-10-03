declare module "test-only:exchange-announcement-normal-form" {
  import type { SyntheticExchangeAnnouncementInput } from "@/domain/intelligence/event-intelligence-exchange-regulatory-announcement-source-qualification";
  export function constructSyntheticAnnouncement(input: unknown): SyntheticExchangeAnnouncementInput | null;
  export function compareFingerprintMaterial(fingerprintA: string, materialA: unknown, fingerprintB: string, materialB: unknown): "DIFFERENT_FINGERPRINT" | "SAME_MATERIAL" | "FINGERPRINT_MATERIAL_CONFLICT";
}
