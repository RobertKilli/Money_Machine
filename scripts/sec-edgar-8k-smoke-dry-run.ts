import { SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN } from "../src/infrastructure/intelligence/sec-edgar-8k-node-transport";

process.stdout.write(`${JSON.stringify(SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN, null, 2)}\n`);
