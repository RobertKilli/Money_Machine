import "server-only";
import type { M5ProviderRateLimitLease } from "./m5-provider-execution-boundary";

/** Conservative per-process lease. It fails closed when burst limits are exhausted. */
export class M5InProcessProviderRateLimitLease implements M5ProviderRateLimitLease {
  private readonly windows = new Map<string, { openedAt: number; count: number }>();
  constructor(private readonly monotonicNow: () => number = () => performance.now()) {}

  async acquire(scope: Readonly<{ providerId: string; datasetId: string; credentialReference: string }>): Promise<boolean> {
    const key = scope.providerId + "\u0000" + scope.datasetId + "\u0000" + scope.credentialReference;
    const now = this.monotonicNow();
    if (!Number.isFinite(now) || now < 0) return false;
    const durationMs = 1_000;
    const maxRequests = scope.providerId === "etherscan" ? 3 : 1;
    const current = this.windows.get(key);
    if (!current || now - current.openedAt >= durationMs) {
      this.windows.set(key, { openedAt: now, count: 1 });
      return true;
    }
    if (current.count >= maxRequests) return false;
    current.count += 1;
    return true;
  }
}
