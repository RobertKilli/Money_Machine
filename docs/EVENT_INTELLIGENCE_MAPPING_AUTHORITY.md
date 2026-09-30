# Event Intelligence Issuer and Asset Mapping Authority

Contract set: `event-intelligence-issuer-mapping-authority/v1`,
`event-intelligence-asset-mention-binding/v1`, and
`event-intelligence-mapped-non-authoritative-claim/v1`.

Status: implemented as synthetic-fixture domain boundaries only. Production
registries are empty; assembly, persistence, event authority, and signals are
blocked. No live identities or mappings are included.

## Architecture decision

Event intelligence is its own upstream context. Issuer identity is legal-entity
authority and is not part of the cryptoasset mapping table.

The existing `AssetMappingRevision` remains the only provider-to-canonical
cryptoasset authority. It binds provider/dataset/version, a typed provider
identity assertion, sealed `SourceLineage`, canonical asset ID/identifier, and
an effective interval. It does not represent an issuer's text mention, locator,
or excerpt. Extending its persistence schema would mix source-record mapping
with event-document interpretation.

This slice therefore adds a narrow immutable **event asset mention binding**.
It binds one trusted normalized claim and its exact locator/excerpt fingerprint
to an already materialized `AssetMappingRevision` ID/fingerprint and its exact
`ProviderAssetIdentityAssertion` ID/fingerprint. The binding copies canonical
asset identity only from that existing revision. It does not create a parallel
canonical-asset registry, revise M5 mapping tables, or add persistence.

Issuer mapping is separate. `event-intelligence-issuer-mapping-authority/v1`
maps a source registrant key and normalized CIK to a canonical issuer and legal
entity. For the fixture source, the synthetic registrant key is explicitly
paired in the reviewed authority with a ten-digit zero-padded synthetic CIK
whose digits are mechanically bound to the fixture key; the fixture key itself
is not an SEC CIK. For `SEC_EDGAR`, the source registrant key must be the same
canonical zero-padded CIK.

## Issuer authority

Each immutable authority binds source namespace, jurisdiction, regulator,
normalized CIK, exact source registrant key and legal name, canonical issuer
and legal-entity IDs, entity type, parent relationship, subsidiary scope,
mapping kind, sorted unique evidence, effective interval, review time,
supersession, revocation, status, deterministic ID/fingerprint, and separate
`recordedAt`. `recordedAt` is outside material identity.

`EXACT_REGISTRANT` resolves only the exact registrant. `EXACT_SUBSIDIARY`
requires an explicit parent and subsidiary scope. `PARENT_RELATIONSHIP` records
a relationship but cannot be used by claim assembly as an issuer identity.
`SUCCESSOR` requires explicit supersession lineage. A ticker or legal-name
similarity is not identity; a CIK does not prove parent/subsidiary equivalence.

The resolver considers exact source namespace, regulator, jurisdiction, CIK,
source registrant key, and `asOf`. Conflicting overlapping active revisions
return `CONFLICT`. Expired, revoked, invalid, absent, copied, and malformed
records fail closed. Superseded records remain resolvable for their historical
effective interval. Supersession is append-only and must point to the exact
prior ID/fingerprint with a matching interval boundary.

## Asset mention binding

The event binding scopes an exact trusted claim ID/fingerprint, extraction
version, synthetic asset candidate ID/name, locator, and excerpt fingerprint.
It also binds chain, lowercase contract address, representation, canonical
asset/representation IDs, existing mapping revision ID/fingerprint, provider
identity assertion ID/fingerprint, evidence, interval, revocation and
supersession. The chain and address must match the existing typed provider
identity assertion; the canonical representation ID must match the existing
mapping revision's canonical identifier.
The event binding additionally requires the identifier's explicit
`representation:<chain-id>:<erc20|bridged|wrapped>:<stable-id>` grammar to
agree with its chain and representation fields. It cannot label an ERC-20
revision as wrapped/bridged, or the reverse.

The currently reusable provider identity contract supports EVM contract
addresses. This event binding therefore accepts explicit ERC-20, wrapped, or
bridged contract representations and does not resolve native assets. BTC and
WBTC, ETH and WETH, and same-symbol assets on different chains remain separate.
The mention binding is an explicit reviewed assertion; it does not infer a
mapping from symbol, name, casing, alias, price, or peg. Missing/ambiguous
candidate material returns `INCOMPLETE` or `CONFLICT`.

## Trust and mapped claim

The issuer authority factory and event mention-binding factory validate strict
plain-object inputs, canonical identifiers/timestamps, evidence uniqueness,
scope, and material fingerprints before minting module-local runtime trust.
Strict parse output is immutable but untrusted. Spread, clone, serialization,
and fabricated lookalikes do not retain runtime trust. Production configuration
contains no authority; passing a record in a caller-created registry does not
make it trusted. Resolver registry entries are all runtime-checked before any
record fields are inspected.

The side-effect-free resolvers return only `RESOLVED`, `INCOMPLETE`, `CONFLICT`,
`EXPIRED`, `REVOKED`, or `INVALID`. No first-match or newest-wins behavior is
used. Each `RESOLVED` witness carries its exact query `asOf`; the assembler
requires both witnesses to match the explicit `mappingAsOf`, which is
`claim.announcementAt` in this fixture-only contract. Filing/acceptance/receipt,
signing, completion, and review timestamps are never silently substituted.
Authorities reviewed after that point are excluded; future `effectiveFrom`
records are not active. Forked supersession chains invalidate the registry,
including for historical lookups. The assembler requires an authentic fixture pipeline result and a claim
that is a member of its trusted sealed claim set, plus an exact issuer authority,
an exact asset mention binding, compatible source/extraction scope, and both
mappings valid at the claim announcement time. It rejects claims connected to
an unresolved amendment/correction edge in that result. Unresolved 8-K/A
correction claims and unsupported lifecycle states cannot be assembled.

Assembly returns a deep-frozen
`MAPPED_NON_AUTHORITATIVE_EVENT_CLAIM`, binding original claim identity,
filing package ID/fingerprint, source artifact ID/fingerprint, issuer
authority, canonical legal entity, mention-binding ID/fingerprint, existing
asset mapping revision, canonical asset representation, and mapping `asOf`.
Its runtime trust is module-local. It is not an authoritative event,
corroboration result, signal, or order. `rejectMappedClaimAsEventAuthority`
always returns `null`.

## Production posture and next slice

Production issuer mappings and event asset mention bindings are empty. Issuer
mapping readiness, asset mapping readiness, event assembly, persistence, event
authority, and signal generation are all `BLOCKED`. No M5 readiness or existing
asset mapping authority is upgraded.

Next, define independent-source corroboration and an event-authority policy:
source qualification, issuer and asset review provenance, correction and
lifecycle resolution, conflict handling, and required approvals must be
resolved before an authority issuer exists. Persistence, acquisition, and
signal generation remain separately scoped future decisions.
