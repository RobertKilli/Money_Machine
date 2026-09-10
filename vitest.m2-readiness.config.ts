import { defineConfig } from "vitest/config";
import baseline from "./vitest.config";

// An explicit policy-conformance gate, separate from the proven M1 regression suite.
// These assertions must turn green before a replay can claim frozen-policy fidelity.
export default defineConfig({
  ...baseline,
  test: { ...baseline.test, include: ["tests/diagnostics/m2-policy-readiness.test.ts"] },
});
