# Evidence review queue milestone and lifecycle evidence decision

**Status:** design recommendation only. No evidence schema, issuer, runtime, parser, factory, persistence path, or approval is implemented by this document.

## Decision

Define two independent, closed and versioned evidence contracts before routing alignment:

1. **Milestone review outcome** records that an identified reviewer/evaluator examined a specific candidate and review milestone at a fixed cutoff, with a bounded outcome. It does not establish source truth or lifecycle status.
2. **Subject lifecycle relation** records a typed, directed assertion between exact subjects/revisions: for example that a new claim revision corrects or supersedes a prior claim, that a claim is retracted, that a source document is withdrawn, or that a candidate reports an event retraction. It does not establish that the assertion was reviewed or accepted.

Keep these as separate records. A review outcome may cite lifecycle-relation records it considered; a lifecycle relation may cite source evidence, but neither record may imply the other. A later evaluator can issue a review outcome that accepts, rejects, or leaves an assertion unresolved under a named review policy. That outcome is an assessment of evidence, not a new source fact. Only a separately authorized source issuer can assert source lifecycle; only an authorized reviewer/evaluator can issue a review outcome; only a future producer can package already-issued records. None can bootstrap the other's authority.

The existing routing `stageHistory` is useful context, not review evidence. A typed review outcome is required before a milestone can be said to be complete or progression can be allowed.

## What exists and what is missing

The routing evaluator starts at `DISCOVERED`, accepts only the built-in decision object and syntactically valid synthetic material, and requires the exact preceding module-local authentic result for progression. Its `WeakSet`/`WeakMap` protects the result object, decision fingerprint, candidate binding, accumulated state sequence, and canonical result inside that process. It does not persist or expose a typed reviewer, milestone decision, or outcome. `correctionResolved` and `retracted` remain synthetic input booleans. The accumulated history shows which route transitions were produced; it does not say that a human or an authorized policy evaluator completed a review.

News discovery validates synthetic `lifecycleHint` fields and `sealDiscoveryOriginSet` checks declared target, origin and ordering relationships before deriving local `ACTIVE`/`CORRECTED`/`RETRACTED` labels. Composition binds these labels and source-type-derived family to its route material, then returns `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`. This is not an applied source-issuer registry or external authority to retract a claim/document.

The queue production configuration contains `reviewerIdentities`, but requires it to be empty; reviewer assignment and all relevant approvals remain blocked. No event-queue reviewer authorization registry, review-result issuer contract, generic source-lifecycle authority registry, or event issuer-evidence persistence is established. Discovery publisher/provider IDs and typed SEC/M5 references are not reviewer identities. SEC and M5 applied authority remains limited to their own contracts. The manifest v1 parser's eight-family union is syntax-only; it resolves neither issuer nor parent. Scope/access classification is not access authorization. Existing policy-application declarations remain `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE` and `MISSING_RUNTIME_RESULT_BINDING`.

## Recommended contract sketches

These are design fields and semantic requirements, not implemented TypeScript types. Every version, enum, reference family, and nested shape must be closed when a future schema is approved. No arbitrary metadata, free-form reviewer notes, raw source text, personal data, or generic `referenceId` may carry authority.

### Milestone review outcome

Proposed separate contract: `event-intelligence-review-milestone-evidence/v1`. A record should bind:

| Binding | Required meaning |
|---|---|
| `milestonePolicyVersion` and `reviewAlgorithmVersion` | Exact rules and evaluator semantics for what was examined. A version labels declared behavior; it does not attest which code ran. |
| `reviewIssuerKind` and typed `reviewIssuerRef` | A manual reviewer or approved automated evaluator, resolved against the appropriate authorization contract. A caller-provided ID is not resolution. |
| Exact `candidateRef` and candidate revision/material identity | The discovery candidate and immutable revision under review; a display ID alone is insufficient. |
| Optional typed `claimRef` and exact revision | Include only where an applied claim identity contract exists. Otherwise return `MISSING_SUBJECT_AUTHORITY`, not an invented event-claim ID. |
| Family-tagged source/document references | Exact source materials actually examined, including revision/fingerprint and any required origin/lifecycle links. Resolve each reference with its family contract. |
| `routingDecisionVersion`, decision fingerprint, authentic routing result identity, current/next state, prior-result identity and exact `stageHistory` | Context for the route and path. Validate the original in-process result before issuing evidence; a decoded or copied result cannot restore its authenticity. |
| Exact `requiredReviewMilestone` and `reviewPolicyVersion` | The milestone being reviewed and the rules for pass, hold, or stop. A state ordinal is not evidence. |
| `evaluationCutoff`, `reviewedAt`, `issuedAt`, and evidence availability time | Fixed historical context and when the reviewed material was actually available and the outcome was issued. |
| Closed `outcome` and bounded reason codes | A machine-readable result; no caller-controlled `approved` or `trusted` boolean. |
| Typed references to lifecycle relation evidence and source evidence | The exact records considered, not an unbounded reference list. |

Do not include raw excerpts or free text by default. If explanation is needed, use a closed reason code and keep any separately approved case notes outside the evidence payload and outside authority evaluation.

### Lifecycle relation assertion

Proposed separate contract: `event-intelligence-subject-lifecycle-relation/v1`. Each relation is directed from an **asserting/newer subject** to the exact **affected target subject**. Both endpoints are discriminated, typed references with family contract, identity and revision; never resolve a relation by generic ID equality.

| Relation kind | From -> to | Meaning; not implied meaning |
|---|---|---|
| `ASSERTS_EVENT_RETRACTION` | Source document/candidate -> event claim | The source reports that the event claim is withdrawn. It is an assertion awaiting review, not an accepted retraction. |
| `RETRACTS_EVENT_CLAIM` | Lifecycle assertion -> exact event-claim revision | Declares that claim retracted under the responsible source/claim contract. The relation record itself remains an assertion until authority and any required review validate it. It does not withdraw the source document. |
| `SUPERSEDES_CLAIM_REVISION` | New claim revision -> prior claim revision | The prior revision is historical and replaced for a specified lineage. Supersession alone does not say the prior claim was false or retracted. |
| `CORRECTS_CLAIM_REVISION` | Correcting claim revision -> corrected prior revision | A correction relationship; its accepted effect and selected revision are decided by the claim/lifecycle contract, not inferred from timestamps. |
| `WITHDRAWS_SOURCE_DOCUMENT` | Lifecycle assertion -> exact source document revision | Declares that the document is not to be used as an active source, pending validation by the responsible authority. Its existence and prior historical use remain represented. This says nothing by itself about the underlying event claim. |

Each assertion should bind the asserting authority/source, exact endpoint references and revisions, origin, relation-effective time, observed/available time, assertion-issued time, and the candidate/evaluation context if one exists. A claim/candidate/document may share context but must not be treated as the same subject. The relation record is an assertion until the responsible authority and any required review resolve it.

Reject self-edges, unsupported endpoint types for a relation, cross-candidate edges unless an explicit lineage contract permits them, candidate/claim identity mismatch, foreign-origin edges where same-origin is required, invalid parent chronology, cycles, multiple incompatible successors, and target reuse that violates the relevant family contract. Correction and retraction edges are preserved even when a duplicate/no-action classification exists. Do not assume all relation families or endpoint authorities exist today.

## Issuers and authorization

Keep four roles separate:

| Role | May assert/issue | Must be checked by | Cannot establish |
|---|---|---|---|
| **Source issuer** | A source record/document's declared publication, correction, withdrawal or lifecycle assertion. | Future source-family contract and authorized source/issuer registry, including exact scope, effective period, revocation and origin binding. | That its assertion is true, that a review is complete, or that a policy was applied. |
| **Manual reviewer** | A bounded assessment for a specific milestone, subject revision, evidence set and cutoff. | A future reviewer identity/role registry plus case-level authorization, expiry/revocation and any separation-of-duty/conflict rules. | Source authorship, new source facts, policy approval, access rights, or event truth. |
| **Automated evaluator** | A milestone outcome computed from exact validated inputs under a named policy/algorithm. | The responsible module's issuance boundary and a separately approved deployment/algorithm identity mechanism; validate authentic inputs at issuance time. | A source assertion, human approval, external authority, or provenance completeness. |
| **Snapshot producer** | A derived snapshot/manifest that references evidence already issued and validated. | Future producer contract, complete parent resolution, and separate storage/read authorization. | A review outcome, lifecycle assertion, issuer identity, or authority merely by packaging or hashing. |

Manual and automated outcomes should use separate issuer kinds and authorization requirements. A manual reviewer can record a judgment; an automated evaluator can record a deterministic policy result. Neither substitutes for the other unless a future milestone policy explicitly authorizes that combination. A caller-supplied issuer string, digest, signature field, or module-local `WeakSet` is not authorization. A signature can only authenticate a key's statement after the key/role and scope are trusted; it cannot prove source truth or approval by itself.

Validate issuer identity and authorization both when evidence is issued and whenever a later evaluator relies on it. Issuance must establish authorization for that issuer, subject, milestone/relation, policy and effective interval. Later revocation must not rewrite the historical record or an evaluation that was valid as-of its cutoff, but it must block new use if the applicable authorization policy treats the issuer as revoked at the new evaluation cutoff. A revocation discovered later is itself later evidence; do not silently backdate it into an earlier as-of evaluation.

No suitable event-queue reviewer/source-issuer registry or generic authorization contract is present in this stack. Existing SEC/M5 contracts cannot be generalized to these roles. These missing contracts block issuance and validation; do not fill them with discovery provider IDs, source labels, reviewer names, or arbitrary fingerprints.

## Closed review outcomes and progression

Use a closed outcome vocabulary, for example:

| Outcome | Completes the milestone? | Allows progression? | Meaning |
|---|---:|---:|---|
| `NOT_COMPLETED` | No | No | Review has not been performed or has not reached an outcome. |
| `EVIDENCE_INSUFFICIENT` | No | No | Required material or authority is absent; hold and request permitted review work. |
| `COMPLETED_PROCEED` | Yes | Potentially | The review obligation is complete and this policy permits the next route transition, subject to all other gates. It is not positive event truth or domain approval. |
| `COMPLETED_STOP` | Yes | No | Review is complete and concludes that this candidate/path must stop. Preserve the evidence and any successor/relation for review. |

Only `COMPLETED_PROCEED` permits progression. `COMPLETED_STOP` also completes the review task, but does not permit progression and terminates that path. The first two outcomes do not complete the milestone. Use `EVIDENCE_INSUFFICIENT` for an unresolved assessment; do not add a fifth indeterminate value unless a future contract demonstrates a distinct machine-actionable meaning. Status must not collapse review completion with review approval.

At issuance, validate the exact candidate/revision, milestone, policy/algorithm versions, cutoff, required source evidence and authentic route result. The outcome must bind the actual prior result and the successful evaluation made from the milestone. A result that merely returns the milestone as `nextState` is arrival, not review completion. A copied/decoded result, blocked or terminal route, mismatched candidate, prior result, origin, policy, or cutoff cannot satisfy it. Missing evidence fails closed and remains visible as unresolved work; no fallback to enum order, caller assertion, empty queue, or prior positive outcome.

An outcome becomes inapplicable to new progression if its subject revision is corrected, retracted, superseded, its source is withdrawn, its review policy changes, its route context changes, or its cutoff changes. Preserve the original outcome as historical. A new evaluation at a new cutoff or revision needs a new bound review outcome; do not mutate the previous one.

## Time and historical cutoff

Keep four time meanings separate:

* `effectiveAt`: when the asserted event/lifecycle relation applies to its subject.
* `observedAt` / `availableAt`: when the source material was observed and could be examined by the reviewer/evaluator.
* `reviewedAt`: when the examination occurred.
* `issuedAt`: when the outcome was fixed and made available as a record.
* `evaluationCutoff`: the exact as-of boundary for the route/snapshot evaluation.

These are distinct fields even though the sketch has five values. For an outcome included in a historical evaluation, source material must have been available by the cutoff and the review outcome must have been issued by the cutoff; `effectiveAt` must satisfy the lifecycle policy's validity interval. `reviewedAt` and `issuedAt` cannot be after cutoff if the outcome is claimed as known at cutoff. A later-discovered relation may state an earlier `effectiveAt`, but it was not known at the historical cutoff and cannot be inserted into that result without an explicitly approved retrospective-evaluation policy. This design recommends no such look-ahead. Use a new later cutoff and append a new evaluation; preserve the earlier snapshot and outcome.

Historical and superseded are separate dimensions: a later cutoff does not make an earlier evaluation disappear, and a superseded revision can remain historically inspectable. None of these times belongs in scope identity; they bind review/lifecycle evidence and the evaluation/snapshot context.

## Append-only correction and conflict handling

Treat both evidence contracts as append-only logical records. A correction to a review outcome creates a new record that explicitly corrects/replaces the exact prior outcome and names the changed subject/policy/evidence; it never overwrites it. Withdrawal of an outcome creates a typed withdrawal relation with a reason code and authorized issuer. Correction, retraction, and supersession of lifecycle assertions likewise append a new relation with exact prior relation and affected target.

Do not use "latest timestamp wins". The closed outcome vocabulary in this decision handles conflicting active outcomes for the same milestone, candidate revision and cutoff, incompatible lifecycle edges, cycle/multiple-successor conflicts, or unresolved issuer revocation as `EVIDENCE_INSUFFICIENT`/hold. Do not add an unspecified conflict status. Resolution must be a new authorized review record bound to the full conflict set, policy version and cutoff. A correction or withdrawal must reference the exact prior evidence record; it may be issued only by that record's authorized issuer or a separately authorized revocation role. Historical evaluations keep the evidence set and authorization state they used as of their cutoff; an appended correction does not silently rewrite their explanation. A new evaluation must re-resolve later corrections/revocations before allowing progression. No persisted current pointer or mutable overwrite is designed here.

## Provenance and snapshot boundary

The current manifest v1 union is closed to `SEC_EVENT_DOCUMENT`, `ISSUER_EVIDENCE`, `ASSET_MAPPING_REVISION`, `DISCOVERY_SOURCE_RECORD`, `CORRECTION_LINEAGE`, `DERIVED_COMPOSITION`, `DERIVED_QUEUE_SET`, and `DERIVED_VIEW_MODEL`. Do not put review outcomes or new lifecycle assertions under `CORRECTION_LINEAGE` merely because that family name sounds related: its current parser shape describes a claim lineage inventory and has no reviewer, milestone outcome, source-document-withdrawal, or authorization semantics.

Recommendation: these two record types have distinct semantics and should receive separate typed provenance family tags (review-milestone evidence and subject-lifecycle relation) only in a separately approved manifest v2 / provenance design, with family-specific parent authority and exact subject binding. Until that schema, applied references, row/candidate derivation graph, and producer rules exist, do not represent them in the v1 manifest. The manifest remains a snapshot-level reference inventory; it cannot itself link each queue row to the review/lifecycle edge that caused it, prove completeness, resolve parents, or reconstruct missing lineage. Hashes/canonical bytes would prove only byte integrity. The view-model remains lossy and cannot be a source for these records.

## Prerequisite and enforcement matrix

| Rule | Future responsible module | Required authority | Existing support / gap | Minimum future tests |
|---|---|---|---|---|
| Source lifecycle assertion is genuine for a document/revision | Source-family adapter and applied issuer registry | Family-specific source issuer identity, scope, revocation and rights | Discovery source types and lifecycle hints are synthetic; generic applied event issuer registry/persistence is missing | Wrong issuer/source family, revoked/out-of-scope issuer, source/document revision mismatch, signature without trusted key rejected |
| Relation endpoints and direction are valid | Typed lifecycle resolver | Applied candidate/claim/document identities and family-specific parent resolver | News discovery checks local same-origin/chronology; no generic event claim authority or persisted parent resolver | Self-edge, wrong endpoint type, cross-candidate/origin, cycle, bad chronology, duplicate successor, correction vs retraction semantics |
| Milestone is completed for exact subject/context | Review-milestone issuer plus routing evaluator | Authorized manual reviewer or approved automated evaluator; policy/algorithm contract | `stageHistory` is authentic local progression only; no typed outcome or reviewer registry | Arrival vs completed gate, prior result copy/mismatch, blocked/terminal history, cutoff, evidence missing, policy mismatch |
| Outcome controls next transition without becoming truth | Routing evaluator | Valid `COMPLETED_PROCEED` outcome under exact policy and context | Routing currently uses synthetic booleans and state branches; no outcome enforcement | Four outcomes, unrelated blockers, outcome revoked/corrected, no enum-order shortcut |
| Historical cutoff is respected | Lifecycle resolver and snapshot producer | Trusted observation/issuance times and fixed cutoff | Current code validates synthetic times, but no review evidence timestamps/selection | Late observation/issuance, retrospective policy absent, new cutoff preserves prior artifact |
| Conflicts remain visible and append-only | Evidence log/resolver and queue classifier | Authorized correction/withdrawal issuer and deterministic conflict policy | No persistence/read/retention approval; queue has known precedence mismatches | Competing outcomes/relations, exact correction edge, duplicate does not suppress, no timestamp-wins |
| Manifest carries evidence only after family approval | Producer and manifest v2 parser | Applied family references, parent resolution, completeness proof, rights | Manifest v1 has eight syntax-only tags and snapshot-level inventory only | Cross-snapshot/scope rejection, per-row binding, missing parent, capacity overflow atomic rejection |
| Reviewer/source access, retention, deletion | Access/rights owner and storage/read boundary | Approved identity, purpose, legal rights, retention/deletion policy | Approvals remain `NOT_APPROVED`; no storage/read path | Unauthorized role, access-classification mismatch, expiry/revocation, deletion/retention policy |


The queue alignment blockers remain open: the parent `conflictActionOrder` is amount/currency-first while runtime conflict classification is lifecycle-first; `routingMappings` order differs from the queue's actual `classify` order; and hint-only material can classify as `RETRACTED` without a corresponding `RETRACTION_PRESENT` blocker. This decision does not reconcile those contracts or change queue behavior.
Keep payloads minimal: typed references, versions, times, closed outcomes and reason codes only. Raw source text, credentials, reviewer free text, personal data and UI fields are excluded by default. Access classification does not grant authorization. Rights, access, retention and deletion remain `NOT_APPROVED`; no schema/FK, database, storage, scheduler, notification, signal or trading work is approved here.

## Next bounded prerequisite

The next step should be a design-only **issuer and reviewer authorization contract decision** for these two evidence types. It must identify the accountable source-authority and reviewer roles, trust anchors/registries, revocation and effective-time rules, scope of permission, manual-vs-automated constraints, and conflict-of-interest/separation rules. This is the first blocker because without it there is no legitimate issuer for either a lifecycle assertion or a review outcome. It should not create a registry or runtime; only after review of that decision should a closed evidence schema or runtime issuer be proposed.
