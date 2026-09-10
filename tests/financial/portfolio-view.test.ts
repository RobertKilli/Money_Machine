import { createElement } from "react";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioView } from "@/components/portfolio-view";
import { projectPortfolio } from "@/domain/portfolio/portfolio-projection";
import { AS_OF, portfolioFixture, withBuy } from "../helpers/portfolio-fixtures";

describe("portfolio presentation", () => {
  it("renders exact quantities, money and fee-inclusive basis without financial number conversion", () => {
    const p = projectPortfolio(withBuy(portfolioFixture(), "fill", 270_000_000n, 13514n, 100n), AS_OF);
    const html = renderToStaticMarkup(createElement(PortfolioView, { portfolio: p }));
    expect(html).toContain("27000.0000"); expect(html).toContain("863.86 NOK"); expect(html).toContain("136.14 NOK");
    expect(html).toContain("Complete valuation"); expect(html).toContain("portfolio-valuation/v1");
    if (process.env.MONEY_MACHINE_PORTFOLIO_PREVIEW === "1") {
      const css = readdirSync(".next/static/chunks").filter(f => f.endsWith(".css")).map(f => readFileSync(`.next/static/chunks/${f}`, "utf8")).join("\n");
      mkdirSync("node_modules/.cache/m1e-preview", { recursive: true });
      writeFileSync("node_modules/.cache/m1e-preview/complete.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>M1E component verification</title><style>${css}</style><body><main class="mx-auto max-w-7xl px-5 py-10"><header class="mb-10"><p class="text-xs tracking-widest text-[var(--accent)]">MONEY MACHINE · SIMULATION ONLY</p><h1 class="mt-3 text-4xl font-semibold">Portfolio</h1></header>${html}</main></body></html>`);
    }
  });
  it("missing data shows unavailable totals and incomplete status", () => {
    const s = withBuy(portfolioFixture(), "fill", 270_000_000n, 13514n, 100n);
    const html = renderToStaticMarkup(createElement(PortfolioView, { portfolio: projectPortfolio({ ...s, prices: [] }, AS_OF) }));
    expect(html).toContain("Incomplete valuation"); expect(html).toContain("Unavailable"); expect(html).toContain("missing market price"); expect(html).not.toContain("0.00 NOK");
    if (process.env.MONEY_MACHINE_PORTFOLIO_PREVIEW === "1") {
      const complete = readFileSync("node_modules/.cache/m1e-preview/complete.html", "utf8");
      writeFileSync("node_modules/.cache/m1e-preview/incomplete.html", complete.replace(/<section aria-label="Portfolio valuation"[\s\S]*<\/section>/, html));
    }
  });
  it("empty projection shows a valid zero portfolio", () => {
    const html = renderToStaticMarkup(createElement(PortfolioView, { portfolio: projectPortfolio(portfolioFixture(0n), AS_OF) }));
    expect(html).toContain("No asset holdings"); expect(html).toContain("0.00 NOK"); expect(html).toContain("Not applicable");
  });
});
