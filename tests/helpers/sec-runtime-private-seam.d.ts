declare module "test-only:sec-runtime-constructor" {
  import type { SecRuntimeMaterial, SecRuntimeTrustedBatch } from "@/domain/intelligence/sec-edgar-event-source-provenance-runtime";
  /** Compiler-only access to private construction, with no production export. */
  export function createSecRuntimeBatch(material:SecRuntimeMaterial):SecRuntimeTrustedBatch;
}
