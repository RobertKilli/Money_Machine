import { describe, expect, it } from "vitest";
import { resolveExternalPaperPrice, type ExternalPaperPriceReceipt, type ExternalPaperPriceRequest } from "@/application/paper-trading/standing-paper-market-price";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION } from "@/domain/strategy/fixture-assets";

const request = {
  instrument: { instrumentId: "paper.external.test-asset-nok", baseAssetId: "test:asset-123", quoteCurrency: "NOK", venueId: "test-venue", venueProductId: "123-NOK" },
  source: { providerId: "test-provider", datasetVersion: "test-ticks/v1", adapterVersion: "test-parser/v1" },
  kind: "LAST_TRADE", accountCurrency: "NOK", decisionId: "synthetic-decision-1", decisionAt: "2026-11-26T10:00:04.000Z", maxAgeMs: 4_000,
} as const satisfies ExternalPaperPriceRequest;

const observation = {
  classification: "EXTERNAL_MARKET", venueId: "test-venue", venueProductId: "123-NOK", baseAssetId: "test:asset-123", quoteCurrency: "NOK",
  source: request.source, sourceRecordId: "tick-001", kind: "LAST_TRADE", decimalPrice: "123.456789",
  observedAt: "2026-11-26T10:00:00.000Z", availableAt: "2026-11-26T10:00:01.000Z", retrievedAt: "2026-11-26T10:00:02.000Z",
} as const satisfies Extract<ExternalPaperPriceReceipt, { status: "OBSERVED" }>["observation"];

describe("standing PAPER market price adapter boundary", () => {
  it("checks a synthetic external-shaped receipt and binds exact price provenance to a decision", () => {
    const receipt = { status: "OBSERVED", observation } as const;
    const resolved = resolveExternalPaperPrice(request, receipt);
    expect(resolved.status).toBe("AVAILABLE");
    if (resolved.status !== "AVAILABLE") throw new Error(resolved.reason);
    expect(resolved.price).toEqual({ currencyCode: "NOK", priceAtoms: 123_456_789n, priceScale: 4 });
    expect(resolved.priceEvidence).toMatchObject({ classification: "EXTERNAL_MARKET", instrument: request.instrument, source: request.source,
      sourceRecordId: "tick-001", kind: "LAST_TRADE", observedAt: observation.observedAt, availableAt: observation.availableAt,
      retrievedAt: observation.retrievedAt, decimalPrice: "123.456789", priceAtoms: "123456789", priceScale: 4 });
    expect(resolved.decisionEvidence).toMatchObject({ decisionId: request.decisionId, decisionAt: request.decisionAt, maxAgeMs: 4_000,
      priceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), inputHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(resolveExternalPaperPrice(request, receipt)).toEqual(resolved);
    expect(resolveExternalPaperPrice({ ...request, decisionId: "synthetic-decision-2" }, receipt)).toMatchObject({
      decisionEvidence: { priceFingerprint: resolved.decisionEvidence.priceFingerprint, inputHash: expect.not.stringMatching(resolved.decisionEvidence.inputHash) },
    });
    expect(resolveExternalPaperPrice(request, { ...receipt, observation: { ...observation, sourceRecordId: "tick-002" } })).toMatchObject({
      decisionEvidence: { priceFingerprint: expect.not.stringMatching(resolved.decisionEvidence.priceFingerprint) },
    });
  });

  it.each([
    [{ venueId: "wrong-venue" }, "INSTRUMENT_MISMATCH"],
    [{ venueProductId: "123-USD" }, "INSTRUMENT_MISMATCH"],
    [{ baseAssetId: "test:wrapped-123" }, "INSTRUMENT_MISMATCH"],
    [{ quoteCurrency: "USD" }, "CURRENCY_MISMATCH"],
    [{ source: { ...request.source, datasetVersion: "other-ticks/v1" } }, "SOURCE_MISMATCH"],
    [{ kind: "ASK" }, "PRICE_KIND_MISMATCH"],
    [{ decimalPrice: "0" }, "PRICE_INVALID"],
    [{ decimalPrice: "0.00000000001" }, "PRICE_INVALID"],
    [{ decimalPrice: "1e3" }, "PRICE_INVALID"],
    [{ retrievedAt: "2026-11-26T10:00:04.001Z" }, "PRICE_FUTURE"],
    [{ observedAt: "2026-11-26T09:59:59.999Z" }, "PRICE_STALE"],
    [{ observedAt: "2026-11-26T10:00:05.000Z", availableAt: "2026-11-26T10:00:05.000Z", retrievedAt: "2026-11-26T10:00:05.000Z" }, "PRICE_FUTURE"],
    [{ availableAt: "2026-11-26T10:00:03.000Z" }, "TIME_INVALID"],
    [{ availableAt: "" }, "TIME_INVALID"],
  ] as const)("blocks an invalid observation (%j)", (override, reason) => {
    expect(resolveExternalPaperPrice(request, { status: "OBSERVED", observation: { ...observation, ...override } })).toEqual({ status: "BLOCKED", reason });
  });

  it("blocks absent and unavailable sources without returning a fixture price", () => {
    expect(resolveExternalPaperPrice(request, null)).toEqual({ status: "BLOCKED", reason: "PRICE_MISSING" });
    expect(resolveExternalPaperPrice(request, { status: "MISSING" })).toEqual({ status: "BLOCKED", reason: "PRICE_MISSING" });
    expect(resolveExternalPaperPrice(request, { status: "UNAVAILABLE" })).toEqual({ status: "BLOCKED", reason: "SOURCE_UNAVAILABLE" });
  });

  it("requires exact quote currency and keeps fixture assets and dataset outside the external boundary", () => {
    const receipt = { status: "OBSERVED", observation } as const;
    expect(resolveExternalPaperPrice({ ...request, instrument: { ...request.instrument, quoteCurrency: "USD" } }, receipt))
      .toEqual({ status: "BLOCKED", reason: "CURRENCY_MISMATCH" });
    expect(resolveExternalPaperPrice({ ...request, instrument: { ...request.instrument, baseAssetId: FIXTURE_ASSETS[0]!.assetId } }, receipt))
      .toEqual({ status: "BLOCKED", reason: "REQUEST_INVALID" });
    expect(resolveExternalPaperPrice({ ...request, source: { ...request.source, datasetVersion: FIXTURE_DATASET_VERSION } }, receipt))
      .toEqual({ status: "BLOCKED", reason: "REQUEST_INVALID" });
  });
});
