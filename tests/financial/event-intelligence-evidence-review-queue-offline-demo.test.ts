import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEventIntelligenceOfflineReviewDemo } from "@/application/intelligence/load-event-intelligence-offline-review-demo";
import { loadEvidenceReviewQueueViewModel } from "@/application/intelligence/load-evidence-review-queue-view-model";

const CUTOFF = "2026-10-03T12:00:00.000Z";

afterEach(() => vi.unstubAllEnvs());

describe("offline evidence-review demo composition and presentation", () => {
  it("composes the three fixed scenarios through the real discovery, routing, queue, and view-model APIs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const first = await loadEventIntelligenceOfflineReviewDemo();
    const second = await loadEventIntelligenceOfflineReviewDemo();

    if (first.status !== "AVAILABLE") throw new Error(first.reason);
    expect(first.status).toBe("AVAILABLE");
    expect(second).toEqual(first);

    expect(first.evaluatedAsOf).toBe(CUTOFF);
    expect(first.scenarios.map(scenario => scenario.key)).toEqual(["issuer-mapping", "rights-blocked", "unresolved-correction"]);

    const [mapping, rights, correction] = first.scenarios;
    expect(mapping?.sourceMaterial).toEqual({
      sourceLabel: "Synthetic News Aggregator",
      sourceType: "NEWS_AGGREGATOR",
      fixtureId: "offline-demo-mapping",
      receivedAt: "2026-10-01T09:00:01.000Z",
      title: "Synthetic Demo Company considers a Bitcoin purchase",
      summary: "Synthetic fixture for an offline review demonstration; no completed event is established.",
      evidence: [
        { label: "Publication time (UTC)", value: "2026-10-01T08:00:00.000Z" },
        { label: "Discovery time (UTC)", value: "2026-10-01T09:00:00.000Z" },
      ],
      relevance: "The synthetic headline mentions an issuer and asset whose mapping remains unverified.",
      synthetic: true,
    });
    expect(rights?.sourceMaterial).toMatchObject({ sourceType: "ISSUER_IR", fixtureId: "offline-demo-rights", synthetic: true });
    expect(correction?.sourceMaterial).toMatchObject({
      sourceType: "ISSUER_IR",
      fixtureId: "offline-demo-correction",
      summary: expect.stringMatching(/no underlying claim or lifecycle authority is established/i),
      evidence: expect.arrayContaining([{ label: "Lifecycle relationship", value: "Unresolved; no authenticated relation is established" }]),
      synthetic: true,
    });
    for (const scenario of first.scenarios) {
      expect(Object.keys(scenario.sourceMaterial).sort()).toEqual(["evidence", "fixtureId", "receivedAt", "relevance", "sourceLabel", "sourceType", "summary", "synthetic", "title"]);
    }
    expect(mapping?.model).toMatchObject({ state: "HAS_REVIEW_ITEMS", generatedForAsOf: CUTOFF, summary: { totalItems: 1, open: 1 } });
    expect(mapping?.model.items[0]).toMatchObject({ reviewType: "ISSUER_MAPPING_REVIEW", status: "OPEN", operationalPriority: "MAPPING_REQUIRED", evaluatedAsOf: CUTOFF });
    expect(mapping?.reviewGuidance).toMatchObject({
      why: expect.stringMatching(/discovery-materiale/i),
      missing: expect.stringMatching(/ikke verifisert.*OPEN.*ikke.*godkjent/i),
      investigate: expect.stringMatching(/issuer og asset/i),
    });

    expect(rights?.model).toMatchObject({ state: "HAS_REVIEW_ITEMS", generatedForAsOf: CUTOFF, summary: { totalItems: 1, blocked: 1 } });
    expect(rights?.model.items[0]).toMatchObject({ reviewType: "RIGHTS_APPROVAL_REVIEW", status: "BLOCKED", operationalPriority: "BLOCKED_RIGHTS", evaluatedAsOf: CUTOFF });
    expect(rights?.model.items[0]?.nextActionLabel).toBe("Resolve source-use approvals");
    expect(rights?.reviewGuidance).toMatchObject({
      why: expect.stringMatching(/brukstillatelse.*ikke er godkjent/i),
      missing: expect.stringMatching(/ikke en godkjenning/i),
      investigate: expect.stringMatching(/tillatt kildebruk/i),
    });

    expect(correction?.model).toMatchObject({ state: "HAS_REVIEW_ITEMS", generatedForAsOf: CUTOFF, summary: { totalItems: 1, blocked: 1, correctionsRequiringReview: 1 } });
    expect(correction?.model.items[0]).toMatchObject({ reviewType: "CORRECTION_LINEAGE_REVIEW", status: "BLOCKED", operationalPriority: "URGENT_CORRECTION_REVIEW", correctionPresent: true, retracted: false, evaluatedAsOf: CUTOFF, historical: true });
    expect(correction?.model.items[0]?.reasonLabels.join(" ")).toMatch(/correction/i);
    expect(correction?.reviewGuidance).toMatchObject({
      why: expect.stringMatching(/correction.*lineage-review/i),
      missing: expect.stringMatching(/ikke løst.*beviser ikke.*lifecycle-relasjon/i),
      investigate: expect.stringMatching(/historical/i),
    });

    const clientPayload = JSON.stringify(first.scenarios.map(({ key, label, description, model }) => ({ key, label, description, model })));
    expect(clientPayload).not.toMatch(/candidateId|routingResultId|fingerprint|canonicalSourceUrl|originBindings|queueSet/i);
    expect(loadEvidenceReviewQueueViewModel()).toMatchObject({ state: "BLOCKED", items: [] });
  });

  it("renders clearly labeled read-only scenario workspaces with safe filters and no approval controls", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: page } = await import("@/app/intelligence/events/review/offline-demo/page");
    const html = renderToStaticMarkup(await page());

    expect(html).toContain("SYNTETISK OFFLINE-DEMO");
    expect(html).toContain("Ingen live nyheter eller godkjente events");
    expect(html).toContain("Disse kandidatene er kun til read-only review");
    expect(html).toContain("Åpen issuer-mapping-review");
    expect(html).toContain("Blokkert: rights-gjennomgang");
    expect(html).toContain("Uavklart correction");
    expect(html).toContain("2026-10-03T12:00:00.000Z");
    expect(html).toContain("ISSUER_MAPPING_REVIEW");
    expect(html).toContain("RIGHTS_APPROVAL_REVIEW");
    expect(html).toContain("CORRECTION_LINEAGE_REVIEW");
    expect(html).toContain("flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between");
    expect(html).toContain("Scenariooversikt");
    const overview = html.match(/<nav aria-label="Scenariooversikt"[\s\S]*?<\/nav>/)?.[0];
    expect(overview).toBeDefined();
    expect(overview?.match(/Historical snapshot/g)).toHaveLength(3);
    expect(html).toContain("Hva mangler?");
    expect(html).toContain("Hva må undersøkes videre?");
    expect(html).toContain("Veiledende neste handling:");
    expect(html.match(/<details aria-label="Synthetic source context"/g)).toHaveLength(3);
    expect(html.match(/View synthetic source context/g)).toHaveLength(3);
    expect(html).toContain("Synthetic fixture material · read-only");
    expect(html).toContain("Synthetic News Aggregator");
    expect(html).toContain("Synthetic issuer investor-relations release");
    expect(html).toContain("Synthetic issuer investor-relations correction notice");
    expect(html).toContain("This fixture is not a source of truth or proof of approval, rights, or lifecycle relationships.");
    expect(html).toContain("Issuer- og asset-koblingene er ikke verifisert");
    expect(html).toContain("brukstillatelse ikke er godkjent");
    expect(html).toContain("Lineage er ikke løst");
    expect(html).toContain("Presentation filters");
    expect(html).toContain("Corrections and retractions are included by default");
    expect(html).toContain('id="queue-issuer-mapping-status"');
    expect(html).toContain('id="queue-rights-blocked-status"');
    expect(html).toContain('id="queue-unresolved-correction-status"');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [, references] of html.matchAll(/\saria-labelledby="([^"]+)"/g)) {
      for (const reference of references.split(/\s+/)) expect(ids).toContain(reference);
    }
    const actionControls = [...html.matchAll(/<button\b[\s\S]*?<\/button>/gi), ...html.matchAll(/<input\b[^>]*>/gi)].map(([markup]) => markup).join(" ");
    expect(actionControls).not.toMatch(/approve|complete review|resolve rights|trading/i);
    const sourceDetails = [...html.matchAll(/<details aria-label="Synthetic source context"[\s\S]*?<\/details>/g)].map(([markup]) => markup);
    expect(sourceDetails).toHaveLength(3);
    expect(sourceDetails.join(" ")).not.toMatch(/<button\b|<form\b|<input\b|<select\b|<a\b/i);
    expect(sourceDetails.join(" ")).not.toMatch(/candidateId|routingResultId|canonicalSourceUrl|originBindings|fingerprint|queueSet/i);
    expect(html).not.toMatch(/candidateId|routingResultId|canonicalSourceUrl/);
  });
});
