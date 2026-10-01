# Event Intelligence Corroboration and Authority Eligibility Policy

## Boundary and authority subject

This is a versioned evaluation boundary, not an event writer. It accepts
runtime-authentic `MAPPED_NON_AUTHORITATIVE_EVENT_CLAIM` material and produces
`EVENT_AUTHORITY_ELIGIBILITY_RESULT`. That result is still not an authoritative
event and the exported boundary always rejects it as event-authority or
persistence input. No transport, repository, unit-of-work, scheduler, signal,
or trading port exists here.

The policy distinguishes two subjects:

* `ISSUER_DISCLOSURE`: evidence that a mapped issuer published a particular
  claim in identified immutable source material. A filing can support that
  the issuer disclosed a definitive agreement or disclosed completion; neither
  statement independently proves the underlying transaction occurred.
* `EXTERNALLY_VERIFIED_EVENT_FACT`: an assertion about the underlying event
  independent of issuer disclosure. This policy version rejects an ACTIVE
  policy for this subject; production records it as `UNSUPPORTED`.

Thus Item 1.01 agreement disclosure cannot become purchase completion. Item
2.01 with explicit completion material can support a disclosure of completion,
not independent verification. A news report about a filing is discovery or
corroboration material, not stronger authority than the filing itself.

## Contracts and trust

The implementation defines:

* `event-intelligence-corroboration-authority-policy/v1`;
* `event-intelligence-source-origin/v1`;
* `event-intelligence-authority-eligibility-result/v1`.

Policy creation enforces exact object fields, canonical sorted unique sets,
evidence references, timestamp bounds, explicit approvals, non-empty source
and event scopes, and an ACTIVE policy with no blockers and all approvals
approved. Parser output is untrusted; only the policy factory can create
runtime-trusted evaluation material. `recordedAt` is excluded from policy
fingerprint material. All returned nested objects are frozen.

Evaluator input is an exact sealed set made only from runtime-authentic mapped
claims paired to their original trusted fixture claims and source-origin
records. A copy, spread, structured clone, JSON round trip, or caller-computed
fingerprint does not carry module-local trust. No caller parser grants trust.

## Source artifact and origin are different

An artifact is an immutable document identity. An origin groups the
publication event that produced the claim. Delivery paths and receipt times
are separate provenance and are excluded from source-origin material identity.
Accordingly, the same SEC accession delivered through submissions, RSS and
archive is one origin. Replaying receipt at a later time does not change
eligibility identity.

Issuer IR and a newswire copy with a declared upstream publication share an
origin group. Aggregator copies are `AGGREGATOR_DISCOVERY` and cannot create an
independent group. URL, hostname, headline, or artifact count alone never
establishes origin independence. Origin lineage that is unknown blocks
evaluation. Source tiers and primary-source presence are checked against the
policy; corroboration counts origin groups, not URLs.

## Event equivalence, cutoff, and conflicts

Claim comparison uses canonical legal issuer, canonical asset representation,
event type, form/item, lifecycle, binding state, amount classification/value,
currency, signing/expected/completion dates, correction reference, and
extraction version. In v1, only the same immutable source claim or an explicit
correction edge establishes event identity. The fixture claim contract has no
stable agreement/transaction reference, so two different claims with matching
issuer, asset, date and amount return `INSUFFICIENT_IDENTITY`; they are never
deduplicated as one event. Headline, ticker, symbol, amount, or date alone
cannot deduplicate. No majority vote, newest-wins, highest-tier-only,
first-match, or largest-value rule is used.

`evaluationAsOf` is the evidence cutoff. A policy reviewed/effective after the
cutoff, evidence published after it, or evidence older than the policy
freshness window blocks evaluation. In this fixture-backed version, claims
are bound only to SEC filing artifacts; a caller cannot relabel the same
artifact as journalism, issuer publication, wire, or exchange material to
manufacture an independent origin. Additional source kinds require their own
authenticated artifact and claim contracts. `evaluatedAt` and receipt
time are recorded separately and do not affect result fingerprint when the
cutoff and source material are unchanged. An origin retraction produces
`RETRACTED`; v1 conservatively returns `CORRECTED` whenever corrected source
material is present. It does not yet select a current claim from amendment
lineage. Missing lineage is `INCOMPLETE`, and correction forks are
`CONFLICT`. Original material is never overwritten. Current-claim selection
for a complete amendment chain remains a blocker for a later policy revision.

The included lifecycle guards distinguish 8-K Item 1.01 definitive agreement
disclosure from Item 2.01 completion disclosure. A completed purchase requires
explicit completion material and a completion date. Intent, rumor, expected
closing, conditional agreement, and discovery-only sources cannot be
upgraded to completion authority.

## Result and production posture

Eligibility statuses are `ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY`,
`INCOMPLETE`, `CONFLICT`, `CORRECTED`, `RETRACTED`,
`UNSUPPORTED_AUTHORITY_SUBJECT`, and `INVALID`. Even the eligible result is
only a candidate for a future separately reviewed authority write. The
boundary `rejectEligibilityAsEventAuthorityOrPersistence` always returns
`null`.

Production has no active policies or source origins. Selected subject is
empty; issuer-disclosure authority, persistence, scheduler, signals and
trading are blocked; externally verified facts are unsupported; approvals are
not approved. No real issuer, asset, source or policy pin is included.

## Evidence and limitations

Tests use synthetic filings, issuers, assets and claims only. They prove the
runtime trust gates, deterministic policy/origin/result fingerprints, receipt
and evaluation-clock invariance, duplicate delivery collapse, correction and
retraction blockers, and production fail-closed configuration. They do not
prove real-world source authenticity, complete source coverage, factual truth,
extraction correctness, or permissions to acquire, retain, redistribute, or
commercially use any source.

Before a persistence-schema/UoW review, the next slice must define how a
separately approved service consumes authentic eligible results, retains
append-only historical results, resolves complete correction lineage, and
audits approvals. It must preserve the distinction between issuer disclosure
and externally verified facts. Production acquisition, event authority,
persistence, signal generation, and trading remain blocked.

## Dependency security review (2026-10-01)

The lockfile moves installed `next` and its pinned `@next/env`/platform SWC
packages from 16.3.4 to 16.3.8. The existing `package.json` range
`^16.3.4` already admits 16.3.8, so no manifest range change is needed. The
lockfile records the 16.3.8 tarball integrity values; no overrides or
resolutions were added and no force audit fix was used.

The Next.js maintainers' `Remote Code Execution in next/og ImageResponse`
advisory (GHSA-vcvr-r3jv-pc5j, CVE-2026-94545; checked 2026-10-01) lists
`>=16.2.0 <16.3.6` as affected and 16.3.6 as the first patched version. The
advisory scopes impact to Node `ImageResponse` use with attacker-controlled
SVG content, attributes, or styles; it says Edge implementation and apps
without those inputs are not affected. Version 16.3.8 is above that patched
version. The official September 2026 security release separately says 16.3.8
addresses the delayed critical and high-severity fixes for that release.
Sources: [Next.js advisory, “Remote Code Execution in next/og ImageResponse”](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), checked 2026-10-01; [Next.js, “September 2026 Security Release”](https://nextjs.org/blog/september-2026-security-release), checked 2026-10-01.
