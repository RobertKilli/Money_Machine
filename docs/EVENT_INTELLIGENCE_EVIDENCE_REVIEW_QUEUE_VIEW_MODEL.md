# Evidence review queue view model

Contract: `event-intelligence-evidence-review-queue-view-model/v1`
Parent: `feat/event-intelligence-evidence-review-queue-contract` at `e8a504aac10d35d8b5e483a91f2b2a0b2dd00c05`.

This stacked checkpoint is a one-way, read-only presentation boundary. It cannot be integrated until its queue-contract parent and this child are reviewed against an updated `main` and integrated in order. The expected audit blocker (`GHSA-vfj7-8cjw-p6xm`, `braces@3.0.3`) remains separate from this contract and prevents a ready-for-PR/security claim.

## Trust and serialization

`adaptEvidenceReviewQueueSetToViewModel` accepts only the module-authentic queue contract and a module-authentic sealed queue set. It verifies the set revision, cutoff, exact member count, frozen dense canonical member order, ordinals, and each item's runtime brand and cutoff. It accepts no caller-supplied item array, and never trusts a parsed, copied, spread, cloned, or serialized object. Invalid inputs produce one sanitized blocked code.

The adapter only degrades: `trusted queue set → untrusted serializable view model`. It has no trust-mint, and the output is not accepted by routing evaluation, queue projection, queue sealing, or event-authority boundaries. Output consists of frozen plain objects, dense arrays, strings, booleans, nulls, and bounded safe integers. JSON round-tripping preserves presentation fields but does not grant trust.

The public key is `eviqv1_` plus a SHA-256 digest of a domain-separated, versioned hash input containing the private review-item identity. It is a stable opaque UI key, not a domain ID, fingerprint, credential, reversible encoding, or authority token. Duplicate keys in one projection fail closed. The model does not publish the source item, candidate, routing, decision, or set fingerprints or IDs.

## Presentation fields

The queue model has `version`, `state` (`BLOCKED`, `EMPTY`, or `HAS_REVIEW_ITEMS`), `generatedForAsOf`, canonical `items`, exact derived `summary`, `emptyState`, and allowlisted `blockedReasons`. No caller text is rendered. Titles, type/status/priority labels, reasons, next actions, source-family/strength labels, and jurisdiction labels come from versioned internal allowlists. Unknown enums fail closed.

Each item carries only its opaque public key, fixed review type/status/operational priority and safe labels, fixed title, safe reason/action/forbidden-conclusion labels, sanitized source-family/strength/jurisdiction summaries, bounded origin and syndicated-copy counts, primary-source/correction/retraction booleans, and UTC publication/discovery/receipt/evaluation times. `historical` is true because every item is a cutoff-bound snapshot; it does not claim that an item is stale. `superseded` is a separate status indicator. It includes no raw headline, issuer or asset text, URL, evidence reference, raw payload, internal ID, fingerprint, or authority object.

The adapter preserves the queue contract's derived type, status, and priority; it does not reevaluate policy. It rejects inconsistent combinations rather than guessing. Retraction and correction remain explicit and cannot be hidden behind duplicate status. `RESOLVED_NON_AUTHORITATIVE` still says non-authoritative. `NO_ACTION` means only that a duplicate requires no new queue action; it does not say the event is false. A completed-purchase mention remains a claim/candidate with an explicit “purchase completion is not confirmed” conclusion.

Summary counts are derived from every canonical member and reconcile to the set. A correction counts as requiring review only while its item status is `OPEN` or `BLOCKED`; resolved non-authoritative corrections remain visible on their item but are not counted as pending work. The summary shows only queue workload categories (total/open/blocked/no-action/retracted/correction/conflict/mapping/primary-source review); it is not source confidence, investment merit, sentiment, amount, or market impact. Source-origin counts remain distinct from record counts and never imply corroboration.

## Historical and production states

Every item time is canonical UTC ISO text; no local timezone or relative-time conversion occurs. The cutoff comes from the sealed set. Existing items are immutable snapshots; a future correction is excluded by the routing parent, while a later snapshot may show it without altering an earlier item. Superseded means retained historical snapshot, not deleted; retracted keeps original history visible.

`createBlockedEvidenceReviewQueueViewModel` supplies the deterministic production-only empty blocked model. It uses no fixture, environment switch, clock, network, database, or domain sample. Queue projection and persistence, scheduler, notifications, reviewer assignment, acquisition, authority, signal, and trading remain blocked. No loader or Next.js route is added.

The separate child UI checkpoint at `feat/event-intelligence-evidence-review-queue-ui` consumes this degraded contract through a server-only blocked loader. Its client receives only this serializable view model, never domain queue items. No persistence, scheduler, notifications, source integration, or sibling source checkpoint import is included. The review queue remains non-authoritative and never a signal or trading dashboard.
