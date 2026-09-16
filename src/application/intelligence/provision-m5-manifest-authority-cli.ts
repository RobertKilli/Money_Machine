export interface ProvisionM5ManifestAuthorityCliArgs {
  readonly configPath: string;
  readonly mode: "DRY_RUN" | "APPLY";
  readonly help?: boolean;
}

export function parseProvisionM5ManifestAuthorityCliArgs(argv: readonly string[]): ProvisionM5ManifestAuthorityCliArgs {
  if (argv.length === 1 && argv[0] === "--help") return { configPath: "", mode: "DRY_RUN", help: true };
  let configPath: string | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      if (apply) throw new Error("M5_CLI_DUPLICATE_APPLY");
      apply = true;
    } else if (arg === "--config") {
      if (configPath !== undefined || !argv[index + 1] || argv[index + 1]!.startsWith("--")) throw new Error("M5_CLI_CONFIG_REQUIRED");
      configPath = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`M5_CLI_UNKNOWN_ARGUMENT:${arg}`);
    }
  }
  if (!configPath) throw new Error("M5_CLI_CONFIG_REQUIRED");
  return { configPath, mode: apply ? "APPLY" : "DRY_RUN" };
}
