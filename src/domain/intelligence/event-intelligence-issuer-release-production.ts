import "server-only";
import config from "../../../config/intelligence/event-intelligence-issuer-release.production.json";
import { parseIssuerReleaseProductionConfig } from "./event-intelligence-issuer-attributed-release-source-qualification";

const parsed = parseIssuerReleaseProductionConfig(config);
if (parsed === null) throw new Error("ISSUER_RELEASE_PRODUCTION_INVALID");
export const ISSUER_RELEASE_PRODUCTION = parsed;
