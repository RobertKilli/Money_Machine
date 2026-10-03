# Event intelligence evidence review queue UI

Route: `/intelligence/events/review`.

This stacked UI checkpoint is based on `feat/event-intelligence-evidence-review-queue-view-model` at `805d4aebf079a7d2b9ff52a5ce1f5ef4909b7a59`. It depends on that parent and cannot be integrated before the parent and this child are reviewed and integrated in order. The baseline audit remains blocked by `GHSA-vfj7-8cjw-p6xm` in `braces@3.0.3`; this is separate from UI behavior and prevents READY_FOR_PR.

## Server/client boundary

The server page calls the server-only `loadEvidenceReviewQueueViewModel` boundary. That loader deterministically returns the parent view-model contract's frozen `BLOCKED` model with no items. It has no provider, network, database, persistence, or credential port. Its sanitized catch path returns the same fixed model and never forwards an exception. The server checks the model's exact serializable schema before passing it to the client workspace.

The client workspace imports only the view-model type (erased at runtime) and renders plain labels and values. Its filters are local presentation state over already loaded items. There are no URL query parameters, cookies, browser storage, demo switch, Server Actions, mutations, route handlers, or fixture imports. Production currently has zero records. Synthetic models are made only in tests; there is no committed browser harness or screenshot.

## Presentation and semantics

The route has one `h1`, a labeled production status, a verification path, workload summary, and a responsive candidate-card list. It preserves the view model's canonical item order and public `eviqv1_` keys. Labels and titles come only from the view model's fixed allowlists; raw headline, issuer, asset, URLs, payload, fingerprints, IDs, and errors are not rendered.

All items are historical cutoff-bound snapshots. The UI labels this explicitly and presents `SUPERSEDED` separately. Correction material and retractions have visible text and stronger border treatment; neither is removed by default filters. Every timestamp is rendered as its original UTC ISO string. The UI does not create local or relative times.

The page explains that a candidate is not a verified event or confirmed purchase. Discovery, issuer disclosure, filing publication, and source strength are not displayed as factual verification. Review priority is operational queue order, not investment confidence. This is not a trading, recommendation, signal, or event-authority interface.

## Accessibility and responsive behavior

Native labeled search/select controls are grouped in a `fieldset` with a `legend`; status changes and empty/no-results states use status regions. Candidate cards use ordered headings, definition lists, semantic `time` elements, visible keyboard focus, and text labels independent of color. Layout uses the existing dark theme tokens and responsive Tailwind breakpoints; cards wrap long text and avoid a wide data table. Reduced motion is respected by using no motion effects. The route is designed for narrow/mobile, tablet, desktop, and zoomed layouts.

## Later integration

Real records require a separately reviewed read-model loader and approved acquisition/persistence boundary. That integration must continue to pass only this degraded, schema-validated view model into the client. No UI route in this checkpoint enables queue persistence, scheduling, notifications, reviewer assignment, source acquisition, event authority, signal generation, or trading. The parent audit blocker must be resolved on `main` before review readiness can change.
