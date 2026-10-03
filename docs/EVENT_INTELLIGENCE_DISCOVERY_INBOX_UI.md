# Event Intelligence discovery inbox UI

## Route and stacked dependency

The read-only workspace is `/intelligence/events`. The home page links to it;
it does not replace the portfolio dashboard. This is a stacked checkpoint based
on discovery contract parent `afa7ce136d27343a4d659b2984a1d2dda427d2f7`, branch
`feat/event-intelligence-news-discovery-contract`. It cannot be merged until:

1. `GHSA-vfj7-8cjw-p6xm` is resolved on `main`;
2. the discovery contract is reviewed again against updated `main` and merged;
3. this UI commit is moved or integrated on top of that merged contract.

The parent contract currently has a review checkpoint blocked by the baseline
audit finding. This UI branch does not resolve or waive it.

## Read-only presentation boundary

The production path is:

`discovery contract → view-model adapter → server-side loader → presentational UI`

`load-discovery-inbox.ts` is server-only and returns an empty blocked view model.
It imports no provider transport, database client, repository, persistence UoW,
or test fixture. There is no demo query parameter, preview endpoint, or feature
flag. Synthetic records are imported only by tests. Until a separate reviewed
read model exists, there is no production record to display.

`DiscoveryInboxViewModel` is a frozen, serializable allowlisted projection. It
contains no runtime trust marker, provider payload, source/document fingerprint,
secret, receipt identity, or event-authority object. The adapter copies bounded
display fields, drops records with unknown authority/status shapes, degrades
untrusted summaries that resemble credential material, and marks every item
`NON_AUTHORITATIVE_DISCOVERY_CANDIDATE` / `DISCOVERY_ONLY`. Mentioned tickers
and names stay unresolved candidates; no canonical asset or issuer mapping is
created. Syndication is displayed as one declared discovery origin group with
its record count, never as independent corroboration.

The UI cannot convert discovery into issuer disclosure authority, an externally
verified fact, mapped event authority, persistence authority, a signal,
recommendation, order, or trade. It is not a signal or trading dashboard.

## Components and view-model fields

- `loadDiscoveryInbox`: server-only, production empty/blocked loader.
- `adaptDiscoveryInbox.server.ts`: server-only allowlisted display projection
  and safe fallback. It rejects native Proxies before reflection and copies
  only own data descriptors, so accessors are not invoked. It sorts using
  explicit ordinal string comparison and makes duplicate display keys unique.
- `DiscoveryInbox`: client-only local filters and accessible record details.
- The route owns page metadata, explanatory status and verification-pipeline
  heading. Native `<details>/<summary>` provides keyboard-operable disclosure;
  the responsive mobile candidate cards replace the wide desktop table.

The view model contains `contractVersion`, state, global and production status,
persistence/provider-stack status, a fixed sanitized notice, and item fields for
headline, bounded summary, all allowlisted category candidates, source type,
attributed issuer and mentioned legal entities/assets, publisher and distributor
roles, canonical source locator, publication/source-updated/discovery/receipt/
evaluation timestamps, declared origin-group display, lifecycle status,
correction parent headline, mapping/retrieval/corroboration statuses, and
hardcoded discovery-only capability labels. No material identity fingerprint
is rendered. External source links are HTTPS-only, show the parsed hostname,
and use `noopener noreferrer`; unsafe link values degrade to no link.

Filters run only against the view model: category, source type, discovery status,
mapping status, lifecycle, issuer mention, asset mention and publication date
range. Invalid category/date values are ignored and surfaced as an invalid
filter state. The default includes corrected and retracted records. No filter
mutates domain material or its fingerprint.

## States and accessibility

Production displays an explicit empty inbox, no selected provider, blocked
acquisition and unavailable persistence. The route also defines loading,
sanitized error, no-filter-results and terminal correction/retraction states.
Status words are visible independently of color. Correction and retraction
history is append-only in the display and terminal states are clearly labeled.

The route has a single descriptive `h1`, nested section headings, labeled
filters, a captioned table with scoped headers on wide screens, semantic cards
on small screens, visible focus outlines, keyboard-operable details and explicit
UTC timestamps. Styling uses existing project CSS variables, wraps long text,
and switches to cards below desktop width. Reduced-motion preferences disable
nonessential transitions/animation. The route was designed for 375 px, 768 px
and desktop; no horizontally scrolling page layout is used (only the desktop
table has a local overflow container).

## Later data integration

Real records may be connected only through a separately reviewed read model
that maps approved source authorities into this presentation contract. That
work must retain this lossy projection boundary and independently authorize
acquisition, normalized persistence, raw storage and retention. The required
sequence remains:

`news discovery → candidate → issuer/asset mapping → authoritative source retrieval → correction/lifecycle reconciliation → corroboration → event authority → separate signal policy`

Discovery must not skip a stage. This route does not advance any stage and does
not grant the parent contract or its blocked checkpoint merge approval.
