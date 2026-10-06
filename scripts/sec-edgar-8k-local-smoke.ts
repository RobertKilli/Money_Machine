import { runSecEdgar8kSmokeCli } from "../src/infrastructure/intelligence/sec-edgar-8k-local-smoke-cli";

const result = await runSecEdgar8kSmokeCli(
  process.argv.slice(2),
  process.env.SEC_EDGAR_8K_OPERATOR_CONTACT,
);
process.stdout.write(result.output.endsWith("\n") ? result.output : `${result.output}\n`);
process.exitCode = result.exitCode;
