import type { M5ManifestAuthorityRecord } from "./m5-manifest-authority";

export interface M5ManifestAuthorityRepository {
  readonly save: (record: M5ManifestAuthorityRecord) => Promise<void>;
  readonly readById: (manifestAuthorityId: string) => Promise<M5ManifestAuthorityRecord>;
}
