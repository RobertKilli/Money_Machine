declare module "test-only:sec-artifact-uow" {
  import type { Sql } from "postgres";
  import type { SecDocumentArtifactWrite } from "@/infrastructure/postgres/sec-edgar-event-source-provenance-uow";

  /** The unchanged private UoW operation, exposed only by the integration loader. */
  export function persistDocumentArtifact(tx: Sql<Record<string, never>>, input: SecDocumentArtifactWrite): Promise<void>;
}
