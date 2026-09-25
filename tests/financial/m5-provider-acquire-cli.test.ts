import { describe, expect, it } from "vitest";
import { isProductionM5ProviderReadinessConfigPath, parseM5ProviderAcquireArgs } from "../../scripts/m5-provider-acquire";

describe("M5 provider acquire CLI arguments", () => {
  it("supports help without config or credential setup", () => {
    expect(parseM5ProviderAcquireArgs(["--help"])).toEqual({ help: true, execute: false });
  });
  it("pins runtime config to the checked-in production readiness file", () => {
    expect(isProductionM5ProviderReadinessConfigPath("config/m5/provider-readiness.production.json")).toBe(true);
    expect(isProductionM5ProviderReadinessConfigPath("config/m5/alternate-approved.json")).toBe(false);
    expect(isProductionM5ProviderReadinessConfigPath(".env")).toBe(false);
  });
  it.each([
    ["missing all", []],
    ["missing provider", ["--config", "config.json"]],
    ["missing range", ["--config", "config.json", "--provider", "coingecko"]],
    ["unknown option", ["--config", "config.json", "--provider", "coingecko", "--contract-address", "0x1111111111111111111111111111111111111111", "--unknown", "bypass"]],
    ["duplicate config", ["--config", "config.json", "--provider", "etherscan", "--contract-address", "0x1111111111111111111111111111111111111111", "--config", "other.json"]],
    ["irrelevant option", ["--config", "config.json", "--provider", "etherscan", "--contract-address", "0x1111111111111111111111111111111111111111", "--coin-id", "ethereum"]],
  ] as const)("rejects %s arguments", (_name, args) => {
    expect(() => parseM5ProviderAcquireArgs(args)).toThrow("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID");
  });
});
