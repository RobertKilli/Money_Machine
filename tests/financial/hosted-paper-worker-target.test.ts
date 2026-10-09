import { describe, expect, it } from "vitest";
import { assertLoopbackWorkerDatabase, assertSupabaseProjectBinding, parseBoundedWorkerOptions, parseNokAmountMinor } from "@/application/paper-trading/hosted-worker-target";

const projectId = "flsfallpputejojncyue";

describe("hosted PAPER worker launch scope", () => {
  it("parses explicit NOK capital without binary floating point", () => {
    expect(parseNokAmountMinor("200")).toBe(20_000n);
    expect(parseNokAmountMinor("200.00")).toBe(20_000n);
    expect(parseNokAmountMinor("0.01")).toBe(1n);
    for (const invalid of ["0", "-1", "1.001", "01", "1e2", "NaN", " 200"]) expect(() => parseNokAmountMinor(invalid)).toThrow();
  });

  it("binds direct Supabase URLs to the explicit project without returning credentials", () => {
    expect(assertSupabaseProjectBinding(`postgresql://postgres:secret@db.${projectId}.supabase.co:5432/postgres`, projectId)).toBeUndefined();
    expect(() => assertSupabaseProjectBinding("postgresql://postgres:secret@db.otherprojectref1234.supabase.co:5432/postgres", projectId)).toThrow("PAPER_WORKER_PROJECT_BINDING_MISMATCH");
  });

  it("accepts only the project-bound Supabase pooler identity and refuses loopback", () => {
    expect(assertSupabaseProjectBinding(`postgresql://postgres.${projectId}:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`, projectId)).toBeUndefined();
    expect(() => assertSupabaseProjectBinding("postgresql://postgres.otherprojectref1234:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres", projectId)).toThrow("PAPER_WORKER_PROJECT_BINDING_MISMATCH");
    expect(() => assertSupabaseProjectBinding("postgresql://postgres:postgres@127.0.0.1:5432/mm_paper_0123456789abcdef0123456789abcdef", projectId)).toThrow("PAPER_WORKER_HOSTED_ENTRYPOINT_REFUSES_LOCAL_DATABASE");
  });

  it("keeps the local worker limited to loopback while hosted mode is separate", () => {
    expect(assertLoopbackWorkerDatabase("postgresql://postgres:postgres@127.0.0.1:5432/mm_paper_0123456789abcdef0123456789abcdef")).toBeUndefined();
    expect(() => assertLoopbackWorkerDatabase(`postgresql://postgres:secret@db.${projectId}.supabase.co:5432/postgres`)).toThrow("PAPER_WORKER_REFUSES_NON_LOCAL_DATABASE");
  });

  it("caps hosted runs at three rounds and validates interval bounds", () => {
    expect(parseBoundedWorkerOptions({ maxRounds: "3", roundIntervalMs: "60000" })).toEqual({ maxRounds: 3, roundIntervalMs: 60_000 });
    for (const maxRounds of ["0", "4", "3.0", "-1"]) expect(() => parseBoundedWorkerOptions({ maxRounds, roundIntervalMs: "60000" })).toThrow("PAPER_WORKER_MAX_ROUNDS_INVALID");
    for (const roundIntervalMs of ["0", "999", "86400001", "1.5", "Infinity"]) expect(() => parseBoundedWorkerOptions({ maxRounds: "3", roundIntervalMs })).toThrow("PAPER_WORKER_ROUND_INTERVAL_INVALID");
  });
});
