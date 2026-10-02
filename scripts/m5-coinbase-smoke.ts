import { COINBASE_SMOKE_AUTHORITY_REGISTRIES, COINBASE_SMOKE_SCOPE, COINBASE_SMOKE_STATUS, planCoinbaseSmoke, smokeArray, smokeError, smokeFreeze } from "@/application/intelligence/m5-coinbase-smoke-contract";

const USAGE = "Usage: npm run m5:coinbase:smoke -- --start <UTC ISO timestamp> --end <UTC ISO timestamp> [--execute --environment LOCAL_SMOKE --authorization <reviewed-reference>]";
export function parseCoinbaseSmokeArgs(input: unknown) {
  const argv = smokeArray(input);
  if (argv.some(value => typeof value !== "string" || !value || value.trim() !== value || value.length > 200)) return smokeError("ARGUMENT_INVALID");
  const options: Record<string, string> = {};
  let execute = false;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index] as string;
    if (flag === "--help" && argv.length === 1) return smokeFreeze({ help: true, execute: false, options });
    if (flag === "--execute") { if (execute) return smokeError("ARGUMENT_INVALID"); execute = true; continue; }
    if (!["--start", "--end", "--environment", "--authorization"].includes(flag) || Object.hasOwn(options, flag) || typeof argv[index + 1] !== "string" || (argv[index + 1] as string).startsWith("--")) return smokeError("ARGUMENT_INVALID");
    options[flag] = argv[++index] as string;
  }
  if (!options["--start"] || !options["--end"] || (execute && (options["--environment"] !== "LOCAL_SMOKE" || !/^review:[a-zA-Z0-9_-]{1,80}$/.test(options["--authorization"] ?? "") || /secret|token|password|credential|https?|api[_-]?key/i.test(options["--authorization"] ?? ""))) || (!execute && (options["--environment"] || options["--authorization"]))) return smokeError("ARGUMENT_INVALID");
  return smokeFreeze({ help: false, execute, options });
}
/** CLI has no environment, credential, DNS, HTTP or persistence ports. */
export function runCoinbaseSmokeCli(argv: unknown) {
  const args = parseCoinbaseSmokeArgs(argv);
  if (args.help) return smokeFreeze({ usage: USAGE });
  const plan = planCoinbaseSmoke({ ...COINBASE_SMOKE_SCOPE, start: args.options["--start"], end: args.options["--end"], granularity: 86400 });
  if (!args.execute) return plan;
  // There is no authority to load. A reference/string is never an executable authority.
  if (COINBASE_SMOKE_AUTHORITY_REGISTRIES.LOCAL_SMOKE.length === 0) return smokeFreeze({ mode: "EXECUTE", status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
  return smokeError("OPERATIONAL_ADAPTER_NOT_APPROVED");
}
if (process.argv[1]?.endsWith("m5-coinbase-smoke.ts")) {
  try {
    const result = runCoinbaseSmokeCli(process.argv.slice(2));
    console.log(JSON.stringify(result));
    if ("status" in result && result.status === "BLOCKED") process.exitCode = 2;
  } catch { console.error(JSON.stringify({ status: "INVALID", code: "M5_COINBASE_SMOKE_ARGUMENT_OR_PLAN_INVALID" })); process.exitCode = 2; }
}
