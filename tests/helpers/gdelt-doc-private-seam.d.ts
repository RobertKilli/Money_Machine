declare module "test-only:gdelt-doc-response" {
  import type { GdeltSyntheticDocResponse } from "../../src/domain/intelligence/event-intelligence-gdelt-doc-source-qualification";
  export function createGdeltDocResponseForTest(input: unknown, evaluationAsOf: string): GdeltSyntheticDocResponse | null;
}
