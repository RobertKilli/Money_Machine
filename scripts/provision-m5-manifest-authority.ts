import { resolve } from "node:path";
import { formatProvisioningCliError, parseProvisionM5ManifestAuthorityCliArgs } from "@/application/intelligence/provision-m5-manifest-authority-cli";
import { provisionM5ManifestAuthorityFromFile } from "@/server/commands/provision-m5-manifest-authority";

const usage = "Usage: provision-m5-manifest-authority --config <path> [--apply]";

async function main(): Promise<void> {
  let args;
  try {
    args = parseProvisionM5ManifestAuthorityCliArgs(process.argv.slice(2));
  } catch (error) {
    const formatted = formatProvisioningCliError(error);
    console.error(JSON.stringify(formatted));
    process.exitCode = formatted.exitCode;
    return;
  }
  if (args.help) { console.log(usage); return; }
  const configPath = resolve(args.configPath);
  let result;
  try {
    result = await provisionM5ManifestAuthorityFromFile(configPath, args.mode);
  } catch (error) {
    const formatted = formatProvisioningCliError(error);
    console.error(JSON.stringify({ configPath, ...formatted }));
    process.exitCode = formatted.exitCode;
    return;
  }
  console.log(JSON.stringify({ configPath, ...result }));
  if (result.status === "DRY_RUN_INVALID" || result.status === "DRY_RUN_INCOMPLETE") process.exitCode = 2;
}

main().catch(error => { const formatted = formatProvisioningCliError(error); console.error(JSON.stringify(formatted)); process.exitCode = formatted.exitCode; });
