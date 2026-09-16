export interface ProvisionM5ManifestAuthorityCliArgs {
  readonly configPath: string;
  readonly mode: "DRY_RUN" | "APPLY";
  readonly help?: boolean;
}

export type ProvisioningCliErrorStatus = "CLI_INVALID_ARGUMENTS" | "DRY_RUN_INVALID" | "AUTHORITY_CONFLICT" | "INFRASTRUCTURE_FAILURE";

export interface FormattedProvisioningCliError {
  readonly status: ProvisioningCliErrorStatus;
  readonly code: string;
  readonly exitCode: 2 | 3;
}

const CONTROLLED_INVALID_CODES = new Set([
  "M5_CONFIG_FILE_READ_FAILED",
  "M5_CONFIG_JSON_INVALID",
  "M5_CONFIG_INVALID",
  "DATABASE_UNCONFIGURED",
]);

const controlledCode = (error: unknown): string | undefined => {
  if (!(error instanceof Error)) return undefined;
  const value = error.message;
  if (CONTROLLED_INVALID_CODES.has(value)) return value;
  if (/^M5_CLI_[A-Z0-9_]+$/.test(value)) return value;
  if (/^M5_MANIFEST_AUTHORITY_CONFLICT$/.test(value)) return value;
  return undefined;
};

/** Converts operational failures to a stable, secret-free CLI contract. */
export function formatProvisioningCliError(error: unknown): FormattedProvisioningCliError {
  const code = controlledCode(error);
  if (code === "M5_MANIFEST_AUTHORITY_CONFLICT") return { status: "AUTHORITY_CONFLICT", code, exitCode: 2 };
  if (code?.startsWith("M5_CLI_")) return { status: "CLI_INVALID_ARGUMENTS", code, exitCode: 2 };
  if (code === "M5_CONFIG_FILE_READ_FAILED" || code === "M5_CONFIG_JSON_INVALID" || code === "M5_CONFIG_INVALID") return { status: "DRY_RUN_INVALID", code, exitCode: 2 };
  if (code === "DATABASE_UNCONFIGURED") return { status: "INFRASTRUCTURE_FAILURE", code, exitCode: 3 };
  return { status: "INFRASTRUCTURE_FAILURE", code: "M5_AUTHORITY_INFRASTRUCTURE_FAILURE", exitCode: 3 };
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
      throw new Error("M5_CLI_UNKNOWN_ARGUMENT");
    }
  }
  if (!configPath) throw new Error("M5_CLI_CONFIG_REQUIRED");
  return { configPath, mode: apply ? "APPLY" : "DRY_RUN" };
}
