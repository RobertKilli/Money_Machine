import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFiles = readdirSync("supabase/migrations").filter((file) => file.endsWith("_m3_server_only_privileges.sql"));
if (migrationFiles.length !== 1) throw new Error(`Expected one M3 privilege migration, found ${migrationFiles.length}`);
const sql = readFileSync(`supabase/migrations/${migrationFiles[0]}`, "utf8");
const tables = [
  "intelligence_providers",
  "intelligence_datasets",
  "intelligence_record_mappings",
  "news_event_revisions",
  "market_observations",
  "macro_observations",
];

describe("M3 server-only privilege migration contract", () => {
  it("targets exactly the six audited registry/evidence tables", () => {
    const qualifiedTables = [...sql.matchAll(/public\.([a-z_]+)/gi)].map((match) => match[1]);
    expect(new Set(qualifiedTables)).toEqual(new Set(tables));
    expect(qualifiedTables).toHaveLength(tables.length);
  });

  it("revokes direct anon and authenticated table privileges without granting replacements", () => {
    expect(sql).toMatch(/revoke\s+all\s+privileges\s+on\s+table[\s\S]+from\s+anon,\s*authenticated\s*;/i);
    for (const table of tables) expect(sql).toContain(`public.${table}`);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\bfrom\s+public\b/i);
    expect(sql).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it("preserves RLS, policies, ownership, and server-side schema objects", () => {
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/enable\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy/i);
    expect(sql).not.toMatch(/create\s+trigger|drop\s+trigger|create\s+function|drop\s+function/i);
    expect(sql).not.toMatch(/security\s+definer/i);
  });

  it("is forward-only privilege DDL with no application data or unrelated M5 changes", () => {
    expect(sql).not.toMatch(/\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b/i);
    expect(sql).not.toMatch(/drop\s+(table|column)|alter\s+table[\s\S]+\b(drop|add|alter)\b/i);
    expect(sql).not.toMatch(/intelligence_(ingestion|source_|asset_mapping)|eligibility_|m5_manifest|canonical_/i);
    expect(sql.trim()).not.toHaveLength(0);
  });
});
