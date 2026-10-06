declare module "test-only:coinbase-node-transport" {
  type Lease = Readonly<{ release(): void }>;
  type Rate = Readonly<{ acquire(profile: string, signal: AbortSignal): Promise<Lease | null> }>;
  type Ports = Readonly<{
    createResolver(options: { timeout: number; tries: number }): {
      resolve4(host: string, callback: (error: unknown, addresses?: string[]) => void): void;
      resolve6(host: string, callback: (error: unknown, addresses?: string[]) => void): void;
      cancel(): void;
    };
    createAgent(options: import("node:https").AgentOptions & { proxyEnv: Readonly<Record<string, never>> }): import("node:https").Agent;
    request(options: import("node:https").RequestOptions): import("node:http").ClientRequest;
    createRateLease(): Rate;
    now(): number;
    currentTime(): string;
    setTimer(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
    clearTimer(timer: ReturnType<typeof setTimeout>): void;
  }>;
  export function runFakeSmoke(plan: unknown, ports: Ports, signal?: unknown): Promise<Readonly<{
    authorityStatus: "NON_AUTHORITATIVE_MARKET_SMOKE"; requestCount: number; totalResponseBytes: number;
    observations: readonly ReturnType<typeof import("../../src/application/intelligence/m5-coinbase-smoke-parser").parseCoinbaseSmokeResponse>[];
    productionStatus: string;
  }>>;
  export function validateAddresses(input: unknown): readonly Readonly<{ address: string; family: 4 | 6; key: bigint }>[];
  export function createRateLease(): Rate;
}
