import "server-only";

import { emptyInbox, type DiscoveryInboxViewModel } from "./discovery-inbox-view-model";

/** No acquisition or persistence adapter exists. Keep production explicitly empty. */
export async function loadDiscoveryInbox(): Promise<DiscoveryInboxViewModel> {
  return emptyInbox();
}
