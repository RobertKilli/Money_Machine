import { createM5SuspiciousCoverageAuthority, type M5SuspiciousCoverageAuthority, type M5SuspiciousCoverageInput } from "@/domain/intelligence/m5-suspicious-coverage";

export type M5SuspiciousCoverageConstruction =
  | Readonly<{ status: "READY"; authority: M5SuspiciousCoverageAuthority }>
  | Readonly<{ status: "INCOMPLETE"; reason: string }>
  | Readonly<{ status: "INVALID"; reason: string }>;

/** Pure boundary: callers provide only evaluation observations; identity and
 * source bindings must already be projected from sealed lineage material. */
export function constructM5SuspiciousCoverage(input: M5SuspiciousCoverageInput): M5SuspiciousCoverageConstruction {
  try {
    if (input.status !== "COMPLETE") return { status: input.status, reason: input.status === "INCOMPLETE" ? "M5_SUSPICIOUS_COVERAGE_INCOMPLETE" : "M5_SUSPICIOUS_COVERAGE_INVALID" };
    const authority = createM5SuspiciousCoverageAuthority(input);
    return { status: "READY", authority };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "M5_SUSPICIOUS_COVERAGE_INVALID";
    return { status: reason.includes("INCOMPLETE") ? "INCOMPLETE" : "INVALID", reason };
  }
}
