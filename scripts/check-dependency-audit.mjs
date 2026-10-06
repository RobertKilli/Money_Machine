import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const CHAIN = [
  { name: "eslint-config-next", version: "16.3.4", next: "@next/eslint-plugin-next", range: "16.3.4" },
  { name: "@next/eslint-plugin-next", version: "16.3.4", next: "fast-glob", range: "3.3.1" },
  { name: "fast-glob", version: "3.3.1", next: "micromatch", range: "^4.0.4" },
  { name: "micromatch", version: "4.0.8", next: "braces", range: "^3.0.3" },
  { name: "braces", version: "3.0.3", next: null },
];
const CHAIN_NAMES = new Set(CHAIN.map(({ name }) => name));

export function parseAuditJson(raw) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    throw new Error("npm audit did not return valid JSON.");
  }
  if (!report || typeof report !== "object" || Array.isArray(report) || report.error) {
    throw new Error("npm audit returned an invalid or operational-error report.");
  }
  if (report.auditReportVersion !== 2 || !report.metadata?.vulnerabilities ||
      !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
      Array.isArray(report.vulnerabilities)) {
    throw new Error("npm audit JSON did not match the supported report schema.");
  }
  return report;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDevOnlyChain(lockfile, auditVulnerabilities) {
  const packages = lockfile?.packages;
  assert(packages && typeof packages === "object", "package-lock.json has no package graph.");
  const root = packages[""];
  assert(root?.devDependencies?.["eslint-config-next"] === "^16.3.4" &&
    !root.dependencies?.["eslint-config-next"],
  "eslint-config-next is no longer the expected direct development dependency.");

  for (const item of CHAIN) {
    const path = `node_modules/${item.name}`;
    const entry = packages[path];
    assert(entry && entry.version === item.version && entry.dev === true && entry.devOptional !== true,
      `${item.name} is not the expected development-only ${item.version} lockfile entry.`);
    if (item.next) {
      const dependencyRange = entry.dependencies?.[item.next];
      assert(dependencyRange === item.range,
        `The expected dependency edge/range ${item.name} -> ${item.next} changed.`);
    }
  }

  const braceEntries = Object.entries(packages).filter(([path]) =>
    path === "node_modules/braces" || path.endsWith("/node_modules/braces"));
  assert(braceEntries.length === 1 && braceEntries[0][0] === "node_modules/braces" &&
    braceEntries[0][1].version === "3.0.3" && braceEntries[0][1].dev === true,
  "The lockfile no longer proves a single development-only braces@3.0.3 installation.");

  for (const item of CHAIN) {
    const vulnerability = auditVulnerabilities[item.name];
    assert(vulnerability && vulnerability.severity === "high" &&
      JSON.stringify(vulnerability.nodes) === JSON.stringify([`node_modules/${item.name}`]),
    `The audited ${item.name} finding no longer matches the reviewed dependency node.`);
    if (item.name === "braces") {
      const advisory = vulnerability.via?.[0];
      assert(advisory && typeof advisory === "object" &&
        advisory.url === EXPECTED_ADVISORY && advisory.name === "braces" &&
        advisory.dependency === "braces" && advisory.severity === "high" &&
        advisory.range === "<=3.0.3",
      "The braces finding is not the specifically reviewed GHSA-vfj7-8cjw-p6xm advisory.");
      assert(JSON.stringify(vulnerability.effects) === JSON.stringify(["micromatch"]),
        "The braces advisory is no longer reached only through micromatch.");
    }
    const index = CHAIN.indexOf(item);
    const expectedVia = item.next ? [item.next] : [
      vulnerability.via?.[0]?.url === EXPECTED_ADVISORY ? vulnerability.via[0] : null,
    ];
    assert(JSON.stringify(vulnerability.via) === JSON.stringify(expectedVia),
      `The audited cause path for ${item.name} changed.`);
    const expectedEffects = index === 0 ? [] : [CHAIN[index - 1].name];
    assert(JSON.stringify(vulnerability.effects) === JSON.stringify(expectedEffects),
      `The audited effect path for ${item.name} changed.`);
  }
}

export function evaluateAuditReport(report, lockfile) {
  const severities = ["high", "critical"];
  const findings = Object.values(report.vulnerabilities);
  const actualCounts = Object.fromEntries(severities.map(severity => [
    severity, findings.filter(item => item?.severity === severity).length,
  ]));
  for (const severity of severities) {
    assert(report.metadata.vulnerabilities[severity] === actualCounts[severity],
      `npm audit ${severity} summary does not match its vulnerability records.`);
  }

  const highCritical = findings.filter(item => severities.includes(item?.severity));
  if (highCritical.length === 0) {
    return { acceptedException: false, highCritical: 0 };
  }

  const names = highCritical.map(item => item.name).sort();
  const expectedNames = [...CHAIN_NAMES].sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames),
    `Unexpected high/critical vulnerability set: ${names.join(", ") || "unnamed finding"}.`);
  assert(highCritical.every(item => item.severity === "high"),
    "A critical vulnerability is never accepted.");

  assertDevOnlyChain(lockfile, report.vulnerabilities);
  return { acceptedException: true, highCritical: highCritical.length };
}

function runAudit() {
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm audit --json --audit-level=high"]
    : ["audit", "--json", "--audit-level=high"];
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
}

function main() {
  const audit = runAudit();
  if (audit.error || audit.status === null || ![0, 1].includes(audit.status)) {
    console.error("Full dependency audit could not complete successfully.");
    process.exitCode = 1;
    return;
  }

  try {
    const report = parseAuditJson(audit.stdout);
    const result = evaluateAuditReport(report, JSON.parse(readFileSync("package-lock.json", "utf8")));
    const hasHighCritical = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical > 0;
    assert((audit.status === 1) === hasHighCritical,
      "npm audit exit status did not match the reported high/critical findings.");

    if (result.acceptedException) {
      console.log("Known development-tooling advisory accepted under the narrow repository policy:");
      console.log("GHSA-vfj7-8cjw-p6xm — braces@3.0.3");
      console.log("Validated the exact ESLint → @next/eslint-plugin-next → fast-glob → micromatch → braces development-only path.");
      console.log("No unexpected high or critical vulnerabilities found.");
    } else {
      console.log("Full dependency audit: no high or critical vulnerabilities found.");
    }
  } catch (error) {
    console.error(`Full dependency audit policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
