import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const cwd = fileURLToPath(new URL("../../", import.meta.url));
async function demo() {
  const { stdout } = await run(process.execPath, ["--import", "tsx", "scripts/kraken-pre-trade-offline-acceptance.ts"], {
    cwd, timeout: 10_000, maxBuffer: 65_536,
  });
  return JSON.parse(stdout);
}

describe("Pre-Trade offline acceptance CLI", () => {
  it("runs the real entrypoint with all synthetic scenarios and zero guarded network calls", async () => {
    const report = await demo();
    expect(report).toMatchObject({
      result: "PASS", executionGate: "SYNTHETIC_TEST_ONLY",
      scope: "OFFLINE_PARSER_AND_EVIDENCE_ONLY; NO_TRANSPORT_OR_WORKER", networkRequests: 0,
      networkGuard: "HTTP_HTTPS_FETCH_TCP_TLS; SCENARIO_WINDOW_ONLY",
      scenarios: {
        validResponseToVerifiedReplay: "PASS", stableSerialization: "PASS", responseOrderPreserved: "PASS",
        manipulatedProjection: "BLOCKED_PACKAGE_INVALID", wrongExpectedFingerprint: "BLOCKED_FINGERPRINT_MISMATCH",
        wrongIdentity: "BLOCKED_PARSE_INVALID", reversedTimestamp: "BLOCKED_PARSE_INVALID",
        wrongSide: "BLOCKED_PARSE_INVALID", providerError: "BLOCKED_PARSE_INVALID", malformedJson: "BLOCKED_PARSE_INVALID",
        oversizedRawResponse: "BLOCKED_PACKAGE_TOO_LARGE", emptyBook: "VALID_EVIDENCE_WITHOUT_DECISION_PRICE",
      },
      evidence: {
        sourceOrigin: "CALLER_SUPPLIED_UNVERIFIED", sourceApproval: "NOT_APPROVED", snapshotSemantics: "UNVERIFIED",
        decisionReadiness: "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS",
        timestamps: { retrievedAtOriginal: "2026-11-27T12:34:56.124000001Z", retrievedAtCeil: "2026-11-27T12:34:56.125Z" },
      },
    });
    expect(report.evidence.book.bids.map((item: { price: { original: string } }) => item.price.original))
      .toEqual(["2042.000", "2043.123456789000"]);
    expect(report.evidence.book.bids[1]).toMatchObject({
      responseIndex: 1, side: "BUY", price: { coefficient: "2043123456789000", scale: 12 },
      submissionTsOriginal: "2026-11-27T12:34:56.123456789Z", publicationTsOriginal: "2026-11-27T12:34:56.123999999Z",
      submissionAtFloor: "2026-11-27T12:34:56.123Z", publicationAtCeil: "2026-11-27T12:34:56.124Z",
    });
    expect(report.evidence.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evidence).not.toHaveProperty("selectedLevel");
    expect(report.evidence).not.toHaveProperty("priceType");
    expect(report.evidence).not.toHaveProperty("rawResponse");
  }, 15_000);

  it("produces the same evidence and report across independent process restarts", async () => {
    const first = await demo();
    const second = await demo();
    expect(second).toEqual(first);
  }, 25_000);
});
