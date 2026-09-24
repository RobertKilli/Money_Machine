import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { assertM5ManifestAuthorityRecord, mapM5ManifestAuthorityRow, type M5ManifestAuthorityRecord } from "@/application/intelligence/m5-manifest-authority";
import type { M5ManifestAuthorityRepository } from "@/application/intelligence/m5-manifest-authority-repository";

type DbClient = Sql | TransactionSql;
type JsonParameter = ReturnType<Sql["json"]>;
const json = (client: DbClient, value: unknown): JsonParameter => typeof (client as DbClient & { json?: (input: unknown) => unknown }).json === "function" ? (client as DbClient & { json: (input: unknown) => unknown }).json(value) as JsonParameter : JSON.stringify(value) as unknown as JsonParameter;

const connection = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_UNCONFIGURED");
  return postgres(url, { max: 1, prepare: true, ssl: "require" });
};
const id = (value: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error("M5_MANIFEST_AUTHORITY_ID_INVALID");
  return value.trim();
};

async function save(client: DbClient, record: M5ManifestAuthorityRecord): Promise<void> {
  assertM5ManifestAuthorityRecord(record);
  await client`insert into public.m5_manifest_authorities (manifest_authority_id,authority_type,authority_version,candidate_id,asset_id,canonical_identifier,asset_class,canonical_context_id,as_of,manifest_schema_version,manifest,compatibility,allowed_dataset_pins,fingerprint,created_at) values (${record.manifestAuthorityId},${record.authorityType},${record.authorityVersion},${record.candidateId},${record.assetId},${record.canonicalIdentifier},${record.assetClass},${record.canonicalContextId},${record.asOf},${record.manifestSchemaVersion},${json(client, record.manifest)}::jsonb,${json(client, record.compatibility)}::jsonb,${json(client, record.allowedDatasetPins)}::jsonb,${record.fingerprint},${record.createdAt}) on conflict (manifest_authority_id) do nothing`;
  const existing = await client`select * from public.m5_manifest_authorities where manifest_authority_id=${record.manifestAuthorityId}`;
  if (!existing.length) throw new Error("M5_MANIFEST_AUTHORITY_NOT_FOUND_AFTER_INSERT");
  const stored = mapM5ManifestAuthorityRow(existing[0] as Record<string, unknown>);
  if (stored.fingerprint !== record.fingerprint) throw new Error("M5_MANIFEST_AUTHORITY_CONFLICT");
}

async function readById(client: DbClient, manifestAuthorityId: string): Promise<M5ManifestAuthorityRecord> {
  const rows = await client`select * from public.m5_manifest_authorities where manifest_authority_id=${id(manifestAuthorityId)}`;
  if (rows.length !== 1) throw new Error("M5_MANIFEST_AUTHORITY_NOT_FOUND");
  return mapM5ManifestAuthorityRow(rows[0] as Record<string, unknown>);
}

export function createM5ManifestAuthorityRepository(client: DbClient): M5ManifestAuthorityRepository {
  return { save: record => save(client, record), readById: authorityId => readById(client, authorityId) };
}

export async function saveM5ManifestAuthority(record: M5ManifestAuthorityRecord): Promise<void> {
  const sql = connection();
  try { await save(sql, record); } finally { await sql.end({ timeout: 5 }); }
}

export async function readM5ManifestAuthority(manifestAuthorityId: string): Promise<M5ManifestAuthorityRecord> {
  const sql = connection();
  try { return await readById(sql, manifestAuthorityId); } finally { await sql.end({ timeout: 5 }); }
}
