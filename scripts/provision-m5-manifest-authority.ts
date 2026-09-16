import { resolve } from "node:path";
import { parseProvisionM5ManifestAuthorityCliArgs } from "@/application/intelligence/provision-m5-manifest-authority-cli";
import { provisionM5ManifestAuthorityFromFile } from "@/server/commands/provision-m5-manifest-authority";

const usage = "Usage: provision-m5-manifest-authority --config <path> [--apply]";

async function main(): Promise<void> {
  let args;
  try {
    args = parseProvisionM5ManifestAuthorityCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({ status: "CLI_INVALID_ARGUMENTS", error: error instanceof Error ? error.message : "M5_CLI_INVALID_ARGUMENTS" }));
    process.exitCode = 2;
    return;
  }
  if (args.help) { console.log(usage); return; }
  const configPath = resolve(args.configPath);
  let result;
  try {
    result = await provisionM5ManifestAuthorityFromFile(configPath, args.mode);
  } catch (error) {
    const code = error instanceof Error ? error.message : "M5_AUTHORITY_PROVISIONING_FAILED";
    const configError = code.startsWith("M5_CONFIG_PARSE:");
    console.error(JSON.stringify({ status: configError ? "DRY_RUN_INVALID" : "INFRASTRUCTURE_FAILURE", configPath, error: configError ? code.slice("M5_CONFIG_PARSE:".length) : code }));
    process.exitCode = configError ? 2 : 3;
    return;
  }
  console.log(JSON.stringify({ configPath, ...result }));
  if (result.status === "DRY_RUN_INVALID" || result.status === "DRY_RUN_INCOMPLETE") process.exitCode = 2;
}

main().catch(error => { console.error(JSON.stringify({ status: "INFRASTRUCTURE_FAILURE", error: error instanceof Error ? error.message : "M5_AUTHORITY_PROVISIONING_FAILED" })); process.exitCode = 3; });
