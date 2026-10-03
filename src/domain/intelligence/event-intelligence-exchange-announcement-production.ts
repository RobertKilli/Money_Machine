import "server-only";
import config from "../../../config/intelligence/event-intelligence-exchange-announcement.production.json";
import { parseExchangeAnnouncementProductionConfig } from "./event-intelligence-exchange-regulatory-announcement-source-qualification";

const parsed = parseExchangeAnnouncementProductionConfig(config);
if (parsed === null) throw new Error("EXCHANGE_ANNOUNCEMENT_PRODUCTION_INVALID");
export const EXCHANGE_ANNOUNCEMENT_PRODUCTION = parsed;
