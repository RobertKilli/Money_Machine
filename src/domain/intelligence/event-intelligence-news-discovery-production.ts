import "server-only";
import config from "../../../config/intelligence/event-intelligence-news-discovery.production.json";
import { parseNewsDiscoveryProduction } from "./event-intelligence-news-discovery";

const parsed = parseNewsDiscoveryProduction(config);
if (parsed === null) throw new Error("NEWS_DISCOVERY_PRODUCTION_INVALID");
export const NEWS_DISCOVERY_PRODUCTION = parsed;
