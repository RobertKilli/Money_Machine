import "server-only";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { parseM5ManifestAuthorityConfig } from "@/application/intelligence/m5-manifest-authority-config";
import { provisionM5ManifestAuthority, type M5ManifestAuthorityProvisioningMode, type M5ManifestAuthorityProvisioningResult } from "@/application/intelligence/provision-m5-manifest-authority";
import { createRawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";
import { createM5ManifestAuthorityRepository } from "@/infrastructure/postgres/m5-manifest-authority-repository";

export async function provisionM5ManifestAuthorityFromFile(configPath: string, mode: M5ManifestAuthorityProvisioningMode): Promise<M5ManifestAuthorityProvisioningResult> {
  let source: string;
  try {
    source = await readFile(configPath, "utf8");
  } catch {
    throw new Error("M5_CONFIG_FILE_READ_FAILED");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("M5_CONFIG_JSON_INVALID");
  }
  let config: ReturnType<typeof parseM5ManifestAuthorityConfig>;
  try {
    config = parseM5ManifestAuthorityConfig(parsed);
  } catch {
    throw new Error("M5_CONFIG_INVALID");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_UNCONFIGURED");
  const sql = postgres(databaseUrl, { max: 1, prepare: true, ssl: "require" });
  try {
    return await provisionM5ManifestAuthority(config, mode, { rawEvidenceRepository: createRawEligibilityEvidenceRepository(sql), authorityRepository: createM5ManifestAuthorityRepository(sql) });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
