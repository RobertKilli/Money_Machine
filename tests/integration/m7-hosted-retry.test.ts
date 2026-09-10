import { createConnection } from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { validateDynamicAllocationPlan, DYNAMIC_ALLOCATION_POLICY_VERSION, DYNAMIC_ALLOCATION_PROFILE_VERSION } from "@/domain/allocation/dynamic-plan";

const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1";
const ref = "flsfallpputejojncyue";
function socket({ host, port }: { host: string[]; port: number[] }) { return createConnection({ host: host[0], port: port[0], family: 4, autoSelectFamily: false }); }

describe.skipIf(!enabled)("ROB-55 hosted retry", () => it("validates frozen M7 semantics without hosted mutation", async () => {
  if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== ref) throw new Error("Unauthorized project");
  const url = process.env.DATABASE_URL; if (!url || !url.includes(ref)) throw new Error("Unauthorized database");
  const sql = postgres(url, { max: 1, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]);
  try {
    const before = (await sql`select count(*)::text count from public.ledger_transactions`)[0]!.count;
    const admission = { admissionId: "rob55-admission", candidateId: "rob55-candidate", assetIdentity: { identityVersion: "asset-identity/v1" as const, assetClass: "SYNTHETIC", namespace: "fixture", canonicalIdentifier: "rob55.asset", providerExternalIds: [] }, asOf: "2026-01-01T00:00:00.000Z", admissionPolicyVersion: "universe-admission-policy/v1" as const, eligibilityEvaluationId: "e", eligibilityPolicyVersion: "asset-eligibility-policy/v1", eligibilityProfileVersion: "mm-synthetic-eligibility-profile/v1", status: "ADMITTED" as const, reasonCodes: [], provenance: [], configFingerprint: "f" };
    const legacy = validateDynamicAllocationPlan({ planVersion: DYNAMIC_ALLOCATION_POLICY_VERSION, profileVersion: DYNAMIC_ALLOCATION_PROFILE_VERSION, asOf: new Date("2026-01-01"), admissionDecisions: [], dynamicTargets: [], datasetPins: ["fixture/v1"] });
    expect(legacy.status).toBe("VALID");
    expect(legacy.baseTargets).toEqual({ "mm.fixture.global.v1": "6000", "mm.fixture.growth.v1": "2500", "mm.fixture.defensive.v1": "1500" });
    expect(legacy.completeTargetVector).toEqual(legacy.baseTargets);
    const plan = { planVersion: DYNAMIC_ALLOCATION_POLICY_VERSION, profileVersion: DYNAMIC_ALLOCATION_PROFILE_VERSION, asOf: new Date("2026-01-01"), admissionDecisions: [admission], dynamicTargets: [{ assetIdentity: "rob55.asset", admissionId: admission.admissionId, targetBps: 300n }], datasetPins: ["fixture/v1"] } as const;
    const result = validateDynamicAllocationPlan(plan); expect(result.status).toBe("VALID"); expect(Object.values(result.completeTargetVector).reduce((n, x) => n + BigInt(x), 0n)).toBe(10000n); expect(result).toEqual(validateDynamicAllocationPlan(plan));
    expect(validateDynamicAllocationPlan({ ...plan, admissionDecisions: [{ ...admission, status: "INCOMPLETE" }]}).status).toBe("INVALID");
    expect((await sql`select count(*)::text count from public.ledger_transactions`)[0]!.count).toBe(before);
  } finally { await sql.end({ timeout: 5 }); }
}));
