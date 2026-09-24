import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateM5ProviderReadinessConfig } from "@/application/intelligence/evaluate-m5-provider-readiness";

const usage = "Usage: m5:provider-readiness --config <path>";

function parseArgs(argv: readonly string[]): { help: boolean; configPath?: string } {
  let help = false;
  let configPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") { if (help) throw new Error("M5_PROVIDER_READINESS_ARGUMENT_INVALID"); help = true; continue; }
    if (arg === "--config") {
      if (configPath !== undefined || !argv[index + 1] || argv[index + 1]!.startsWith("--")) throw new Error("M5_PROVIDER_READINESS_ARGUMENT_INVALID");
      configPath = argv[index + 1]; index += 1; continue;
    }
    throw new Error("M5_PROVIDER_READINESS_ARGUMENT_INVALID");
  }
  if (!help && configPath === undefined) throw new Error("M5_PROVIDER_READINESS_CONFIG_PATH_REQUIRED");
  return { help, ...(configPath === undefined ? {} : { configPath }) };
}

async function main(): Promise<void> {
  let args: { help: boolean; configPath?: string };
  try { args = parseArgs(process.argv.slice(2)); } catch (error) { console.error(JSON.stringify({ code: error instanceof Error ? error.message : "M5_PROVIDER_READINESS_ARGUMENT_INVALID", exitCode: 2 })); process.exitCode = 2; return; }
  if (args.help) { console.log(usage); return; }
  let raw: string;
  try { raw = await readFile(resolve(args.configPath!), "utf8"); } catch { console.error(JSON.stringify({ code: "M5_PROVIDER_READINESS_CONFIG_IO_FAILED", exitCode: 3 })); process.exitCode = 3; return; }
  let input: unknown;
  try { input = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { console.error(JSON.stringify({ code: "M5_PROVIDER_READINESS_CONFIG_INVALID", exitCode: 2 })); process.exitCode = 2; return; }
  const evaluation = evaluateM5ProviderReadinessConfig({ config: input, evaluatedAt: new Date().toISOString() });
  const output = { result: evaluation.result, providerId: evaluation.providerId, datasetId: evaluation.datasetId, datasetVersion: evaluation.datasetVersion, evaluatedAt: evaluation.evaluatedAt, blockers: evaluation.blockers.map(blocker => ({ code: blocker.code, ...(blocker.capability === undefined ? {} : { capability: blocker.capability }), ...(blocker.usage === undefined ? {} : { usage: blocker.usage }) })) };
  console.log(JSON.stringify(output));
  if (evaluation.result !== "READY") process.exitCode = 2;
}

main().catch(() => { console.error(JSON.stringify({ code: "M5_PROVIDER_READINESS_IO_FAILED", exitCode: 3 })); process.exitCode = 3; });
