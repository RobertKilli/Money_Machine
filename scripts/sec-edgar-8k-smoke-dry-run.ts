import { createSecEdgar8kLocalSmokeDryRun } from "../src/infrastructure/intelligence/sec-edgar-8k-local-smoke-dry-run";

const result = createSecEdgar8kLocalSmokeDryRun(process.env.SEC_EDGAR_8K_OPERATOR_CONTACT, new Date().toISOString());
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
