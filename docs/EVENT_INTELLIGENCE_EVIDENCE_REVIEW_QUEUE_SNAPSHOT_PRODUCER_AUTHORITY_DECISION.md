# Evidence review queue snapshot producer authority decision

Decision contract: `event-intelligence-evidence-review-queue-snapshot-producer-authority-decision/v1`

Production config: `event-intelligence-evidence-review-queue-snapshot-producer-production/v1`

## Decision

An authentic snapshot producer is a future capability and remains blocked. The contract parser accepts only this fixed decision material; the production-config parser accepts only the exact blocked configuration. Neither parser is a readiness calculator, resolver, approval mechanism, producer, or runtime gate for other modules. A `VALID_DECISION_ONLY_BLOCKED_UPSTREAM` result means the supplied closed material matches the documented recommendation, not that its prerequisites exist.

The future producer must receive an authentic composition and sealed queue result derived from approved source inputs, explicit scope material, independently verified policy content and exact applied policy bindings, one canonical cutoff and pinned contract versions, plus authenticated family-specific references and a closed candidate-to-parent lineage. It must not reconstruct authority from a decoded snapshot/pair result, serializable view model, caller-supplied family tag, generic identifier, or digest alone.

## Existing capability and its limits

| Tracked contract | What exists | What it does not prove |
|---|---|---|
| `src/domain/intelligence/event-intelligence-news-discovery.ts` | Parser-created discovery candidate and cutoff-bounded discovery-origin-set objects carry process-local WeakSet authenticity. Candidate records include source type, source origin, lifecycle hints and receipt fields. | The contract calls the records `SYNTHETIC` and `DISCOVERY_ONLY`; module-local object authenticity does not establish that a live provider supplied true material or that a source has production authority. |
| `src/domain/intelligence/event-intelligence-source-portfolio-routing-decision.ts` | Routing evaluations are created by the authentic routing evaluator and bound to its fixed source-portfolio decision and parsed scenario material. | Routing input is explicitly synthetic. `rightsApproved`, mapping and qualification inputs are scenario facts; they are not approvals, applied mappings, retrieved source evidence, or proof of a policy named in scope material. |
| `src/application/intelligence/compose-event-intelligence-evidence-review-queue.ts` | Composition checks candidate object authenticity, a common cutoff, candidate-bound synthetic routing fields, discovery lifecycle/correction links, and produces an authentic local queue-set/view-model flow. It derives a routing family from the authenticated candidate `sourceType` rather than accepting extra `seenFamilies`. | Composition accepts no scope or scope-policy input, returns `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`, and does not carry evidence that scope policies were applied. Its WeakSet-authentic intermediate objects do not bridge that missing policy binding. |
| `src/domain/intelligence/event-intelligence-evidence-review-queue.ts` | Queue items and sealed sets have process-local authenticity, fixed contract/decision fingerprints, consistent cutoff and deterministic member ordering. Authority and persistence flags remain false. | A locally authentic derived queue set is not a production source decision, complete provenance graph, persisted record, or approved snapshot producer. |
| `src/domain/intelligence/event-intelligence-evidence-review-queue-view-model.ts` | The public projection validates authentic local queue inputs and emits bounded, frozen, serializable presentation data. | The projection omits candidate IDs, routing IDs/fingerprints and canonical source material. It cannot reconstruct which exact source, mapping or correction parents produced each row and its JSON form has no module-local trust. |
| `src/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity.ts` | Recomputes a canonical syntax identity for a closed scope shape. | Policy ID/version/digest fields are caller-supplied syntax. The digest is not checked against policy content or approval, and scope identity does not prove the corresponding policy was used during composition. |
| `src/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-provenance-manifest.ts` | Checks exact family-tagged reference shapes and declared member/root bindings. | It does not resolve parents or authenticate candidates, classify real source type, connect parents to rows, or prove completeness. |
| Snapshot/manifest codecs and binding/pair verifiers | Recompute byte digests, enforce canonical wire formats, and compare explicitly supplied scope/digest/cutoff values. | Caller-supplied expectations remain unauthenticated. Local digest/readback is not producer authenticity, storage authority, or read authorization. |

### Scope policies must be proven applied

Before production, the producer must independently resolve each immutable policy/contract pin against approved canonical policy material, recompute its material identity, and compare the exact version and content identity with the policy artifact actually consumed by composition. This includes review purpose, issuer/listing eligibility, source portfolio, routing, queue contract, asset/event/jurisdiction universe and access classification. A matching-looking scope digest supplied by a caller is insufficient.

The current composition input is only `{ evaluationAsOf, candidates }`; it contains no scope identity or applied-policy evidence. The scope builder accepts policy references and hashes their supplied fields but has no resolver. The route evaluator is bound to its own fixed source-portfolio decision, but composition never proves that an external scope pin is that decision or that every other scoped policy was applied. This is a missing capability; this slice adds no fields to runtime objects.

Access classification describes the intended scope category. It is not user/tenant authentication, rights approval, or an authorization decision. Those require separately approved ownership, access and source-use contracts.

## Future provenance derivation

Derive the manifest from the authentic composition inputs and outputs, not from the final view model. Establish an authenticated edge from each candidate and each applied decision to every source, mapping, correction and derived parent actually consumed. Compute provenance closure before writing any artifact: include all used parents and every correction/retraction that affected routing, queue state or view at the exact cutoff; deduplicate shared parents only by full family-tagged reference; preserve distinct revisions and ordered lineage members; exclude unrelated material added only to increase family diversity or count.

| Family | Future derivation rule | Current authority boundary |
|---|---|---|
| `SEC_EVENT_DOCUMENT` | Include exact SEC profile, filing, document/package/member or SEC-lineage key for a source actually consumed. Keep acquisition receipt as separate availability evidence. | Applied keys exist within the SEC source contract only. |
| `ISSUER_EVIDENCE` | Include only a parent created under an approved issuer-evidence contract and bound to authenticated issuer/source-origin evidence. | No applied event issuer-evidence parent. The current tag/reference parser is syntax only. |
| `ASSET_MAPPING_REVISION` | Include each exact mapping revision actually applied, retaining the full family key and distinct revisions. | M5 mapping authority is applied only in M5's provider/dataset scope; no event-specific bridge is established. |
| `DISCOVERY_SOURCE_RECORD` | Include each authenticated source record actually consumed. The authenticated source classification determines its family; an aggregator stays discovery-only. | No applied event discovery-source parent. Sibling qualification checkpoints are not imported authority. |
| `CORRECTION_LINEAGE` | Include every ordered claim/correction/retraction lineage that affected the result, including selected terminal revision and evaluation cutoff. | No applied normalized event claim/correction parent. A syntactic reference and cutoff match do not resolve or complete lineage. |
| `DERIVED_COMPOSITION` | Bind the exact authenticated composition contract, material and consumed candidate set. | Current composition is synthetic and carries no scope-policy bindings. |
| `DERIVED_QUEUE_SET` | Bind the exact sealed queue contract, decision, member set and cutoff derived from that composition. | Queue-set authenticity is process-local and its authority/persistence flags are false. |
| `DERIVED_VIEW_MODEL` | Bind the exact safe view-model contract and emitted payload as a derived child, without treating it as source evidence. | It is a lossy presentation projection and cannot be the origin from which lineage is reconstructed. |

The manifest remains a snapshot-level reference inventory, not a row/candidate-level derivation graph. To claim completeness, a future producer must retain or receive candidate-to-source, candidate-to-mapping, correction/retraction, composition-to-queue and queue-to-view edges, then prove that every required edge is represented and no required parent was omitted. The current manifest schema has no row link or authentic input graph. Structural parsing, canonical sorting, digest checks and byte readback cannot establish authentic producer-completeness.

Family assignment must come from authenticated source type/classification and its approved source contract, not a manifest member tag. An aggregator cannot be relabeled as issuer, regulatory or filing material. Origin independence must be assessed from original publisher/material lineage and shared-origin edges; provider IDs, URLs, reference diversity and member counts are not independent origins or corroboration.

## Applied keys and migration evidence

Tracked migration review confirms two bounded applied families:

* SEC source/document/package/member/receipt/lineage parents are defined in `supabase/migrations/20261002090638_sec_edgar_event_source_provenance.sql`. Their keys, immutability and seals apply within the SEC source contract; they do not create queue snapshot or producer authority.
* M5 mapping begins with `20260916212845_m5_mapping_lineage.sql`; source lineage is introduced in `20260917012625_m5_source_lineage.sql`; `20260918181115_m5_mapping_source_lineage.sql` adds the mapping-to-lineage binding; and `20260918215043_m5_raw_source_lineage.sql` updates the final applied mapping key to `(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class)`. Later tracked changes add provider-asset assertion and assessment-binding relationships without replacing that final eight-column key. It remains M5-only authority.

Searching the tracked migration set for issuer-evidence, discovery-source-record, normalized event-claim and correction-lineage parents found no applied event persistence for those families. Existing issuer/event persistence descriptions are design-only. No new FK, table, or sibling qualification is inferred by this decision.

## Capacity, correction and artifacts

Current presentation, snapshot, manifest and scope bounds are 512 view-model items, 1,048,576 snapshot bytes, 128 unique manifest members, 786,432 manifest bytes and 18,264 scope-material bytes. They are separate limits. A 512-item presentation can refer to more than 128 distinct source, mapping, correction and derived parents. If the complete unique inventory exceeds 128 members or canonical material exceeds either byte budget, a future producer must fail the entire operation. It must not truncate, omit parents, claim completeness, or silently split/batch. Pagination, batching and scope splitting need separate decisions.

Correction evaluation time must equal the snapshot envelope cutoff. A correction, retraction, policy revision or other material change produces a new immutable artifact pair; it does not rewrite an earlier declaration. `historical` and `superseded` remain separate, and the producer cannot infer which snapshot is current.

A future producer may return canonical snapshot bytes and their digest, canonical manifest bytes and their digest, scope identity, plus separate evidence of producer context and policies actually applied. These are not one authenticated expectation record today. The pair verifier recomputes digests and checks binding against caller-supplied expected values; it does not authenticate their source. A future storage/read design must establish trusted expectation ownership, validate stored artifacts and authorization, and make a separately approved selection. This decision chooses no backend, persisted pointer, or current-selection rule. No signature, new wire envelope, or authority seal is defined here.

## Prerequisite sequence

| Order | Prerequisite | Tracked evidence / blocker |
|---|---|---|
| 1 | Approve rights, retention/deletion and scope/access ownership; define an authentic expectation owner. | Snapshot scope decision and read-model decision keep those approvals `NOT_APPROVED`; pair verifier accepts caller expectations. |
| 2 | Define applied family-specific source and event mapping parents for issuer evidence, discovery records and event claims/corrections. | The migration scan shows only SEC and M5 applied families; `EVENT_INTELLIGENCE_PERSISTENCE_SCHEMA_UOW_DECISION.md` is design-only for other event parents. |
| 3 | Add an authentic non-synthetic candidate/composition contract that carries exact applied policy bindings and authenticated source classifications. | `compose-event-intelligence-evidence-review-queue.ts` accepts synthetic routing scenarios and no scope/policy evidence. |
| 4 | Define and preserve candidate/row-to-parent derivation edges, correction closure, origin graph and atomic capacity failure. | The current manifest is snapshot-level only; view-model projection intentionally removes source/domain identifiers. |
| 5 | Separately approve an authentic producer and its exact artifacts/expectation record. | Current codecs/pair verifier establish local integrity only; no producer or signature is defined. |
| 6 | Decide storage, read authorization and current-selection in a separate slice. | Read-model production config keeps persistence/read/current selection blocked; no backend is selected here. |

## Strict blocked production configuration

The new versioned config requires producer activation `BLOCKED`, null selected producer and authority strategy, empty producer/scope/provenance registries, every producer/right/retention/deletion/access approval `NOT_APPROVED`, persistence/read/current-selection/signal/trading `BLOCKED`, and authority upgrade `UNSUPPORTED`. Its parser rejects any changed, missing, extra, accessor-backed or malformed value. It is a fixed config contract, not an env switch or runtime producer wiring. The existing production loader/configs are unchanged.
