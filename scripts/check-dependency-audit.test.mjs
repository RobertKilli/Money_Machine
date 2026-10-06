import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditReport, parseAuditJson } from "./check-dependency-audit.mjs";

const chain = [
  ["eslint-config-next", "16.3.4", "@next/eslint-plugin-next", "16.3.4"],
  ["@next/eslint-plugin-next", "16.3.4", "fast-glob", "3.3.1"],
  ["fast-glob", "3.3.1", "micromatch", "^4.0.4"],
  ["micromatch", "4.0.8", "braces", "^3.0.3"],
  ["braces", "3.0.3", null, null],
];

function fixtures() {
  const packages = { "": { devDependencies: { "eslint-config-next": "^16.3.4" } } };
  const vulnerabilities = {};
  for (const [index, [name, version, next, range]] of chain.entries()) {
    packages[`node_modules/${name}`] = {
      version, dev: true,
      ...(next ? { dependencies: { [next]: range } } : {}),
    };
    vulnerabilities[name] = {
      name, severity: "high", isDirect: index === 0,
      via: next ? [next] : [{ name: "braces", dependency: "braces", severity: "high", range: "<=3.0.3", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }],
      effects: index === 0 ? [] : [chain[index - 1][0]],
      nodes: [`node_modules/${name}`],
    };
  }
  const report = {
    auditReportVersion: 2,
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } },
    vulnerabilities,
  };
  return { report, lockfile: { packages } };
}

test("accepts only the reviewed braces development-tooling chain", () => {
  const { report, lockfile } = fixtures();
  assert.deepEqual(evaluateAuditReport(report, lockfile), { acceptedException: true, highCritical: 5 });
});

test("rejects an unrelated high vulnerability", () => {
  const { report, lockfile } = fixtures();
  report.vulnerabilities.other = { name: "other", severity: "high", nodes: ["node_modules/other"] };
  report.metadata.vulnerabilities.high = 6;
  assert.throws(() => evaluateAuditReport(report, lockfile), /Unexpected high\/critical vulnerability set/);
});

test("rejects a critical vulnerability even on the known chain", () => {
  const { report, lockfile } = fixtures();
  report.vulnerabilities.braces.severity = "critical";
  report.vulnerabilities.braces.via[0].severity = "critical";
  report.metadata.vulnerabilities.high = 4;
  report.metadata.vulnerabilities.critical = 1;
  assert.throws(() => evaluateAuditReport(report, lockfile), /critical vulnerability is never accepted/);
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseAuditJson("{"), /did not return valid JSON/);
});

test("rejects when the known dependency is not demonstrably dev-only", () => {
  const { report, lockfile } = fixtures();
  lockfile.packages["node_modules/braces"].dev = false;
  assert.throws(() => evaluateAuditReport(report, lockfile), /not the expected development-only/);
});

test("rejects a widened dependency edge", () => {
  const { report, lockfile } = fixtures();
  lockfile.packages["node_modules/micromatch"].dependencies.braces = "*";
  assert.throws(() => evaluateAuditReport(report, lockfile), /dependency edge\/range micromatch -> braces changed/);
});

test("rejects a changed advisory identifier", () => {
  const { report, lockfile } = fixtures();
  report.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-changed";
  assert.throws(() => evaluateAuditReport(report, lockfile), /not the specifically reviewed/);
});
