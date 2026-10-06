import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateOfflineInputLabAction } from "@/app/intelligence/events/review/offline-demo/input-lab/actions";
import OfflineReviewInputLabPage from "@/app/intelligence/events/review/offline-demo/input-lab/page";

afterEach(() => vi.unstubAllEnvs());

describe("offline input lab gates", () => {
  it.each(["production", "test", "", "staging", undefined])("route rejects NODE_ENV=%s before rendering the form", environment => {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => OfflineReviewInputLabPage()).toThrowError(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  });

  it.each(["production", "test", "", "staging", undefined])("direct action rejects NODE_ENV=%s before reading caller form values", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    const hostile = new Proxy(new FormData(), { get() { throw new Error("form must not be read before gate"); } });
    await expect(evaluateOfflineInputLabAction(hostile)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("renders the bounded form and points navigation at the input lab in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const markup = renderToStaticMarkup(React.createElement(OfflineReviewInputLabPage));
    expect(markup).toContain("Syntetiske input-laboratorium");
    expect(markup).toContain("Kjør syntetisk evaluering");
    expect(markup).toContain("Tilbakestill eksempel");
    expect(markup).toContain("/intelligence/events/review/offline-demo/input-lab");
    expect(markup).not.toMatch(/name="[^"]*(?:candidateId|fingerprint|routingMaterial)/);
  });
});
