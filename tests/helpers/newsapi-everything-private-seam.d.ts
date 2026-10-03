declare module "test-only:newsapi-everything-response" {
  import type { NewsApiSyntheticResponse } from "../../src/domain/intelligence/event-intelligence-newsapi-everything-source-qualification";
  export function createNewsApiEverythingResponseForTest(input: unknown, evaluationAsOf: unknown): NewsApiSyntheticResponse | null;
}
