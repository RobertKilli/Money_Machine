import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatManualIngestionCliError, parseManualIngestionCliArgs } from "@/application/intelligence/manual-ingestion-cli";
import { runManualIngestionToLineage } from "@/server/commands/manual-ingestion-to-lineage";
const usage = "Usage: m5:ingest --package <path> [--apply]";
async function main() { let args; try { args = parseManualIngestionCliArgs(process.argv.slice(2)); } catch (error) { const out = formatManualIngestionCliError(error); console.error(JSON.stringify(out)); process.exitCode = out.exitCode; return; } if (args.help) { console.log(usage); return; } let input: unknown; try { input = JSON.parse(await readFile(resolve(args.packagePath!), "utf8")); } catch { console.error(JSON.stringify({ code: "M5_MANUAL_PACKAGE_JSON_INVALID", exitCode: 2 })); process.exitCode = 2; return; } try { const result = await runManualIngestionToLineage(input, args.apply); console.log(JSON.stringify(result.status === "DRY_RUN_READY" ? { status: result.status, requestId: result.plan.request.ingestionRequestId, attemptId: result.plan.attempt.ingestionAttemptId, sourceLineageId: result.plan.sourceLineageId, memberCount: result.plan.memberCount } : result)); } catch (error) { const out = formatManualIngestionCliError(error); console.error(JSON.stringify(out)); process.exitCode = out.exitCode; } }
main();
