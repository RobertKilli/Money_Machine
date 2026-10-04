# Composition policy application evidence contract

Contract: `event-intelligence-evidence-review-queue-composition-policy-application-evidence/v1`
Blocked config: `event-intelligence-evidence-review-queue-composition-policy-application-production/v1`

## Decision and boundary

This slice defines a serializable declaration shape and a strict syntax parser. A successful parse is `VALID_SYNTAX_ONLY_NON_AUTHORITATIVE`. It means that two syntactically valid scope materials are equal, their recomputed identity matches the declared identity, and the declared composition contract version and cutoff have the required syntax. It does **not** show that the composition applied any policy. `declaredAppliedScopeMaterial` is caller-declared data, not an application receipt. The fixed `resultBinding: MISSING_RUNTIME_RESULT_BINDING` explicitly records that there is no established binding from this serializable declaration to one authentic composition result.

The closed v1 object contains exactly `contractVersion`, `scopeIdentity`, `expectedScopeMaterial`, `declaredAppliedScopeMaterial`, and `evaluation`. `evaluation` contains exactly the existing composition contract version, canonical UTC millisecond cutoff, and the missing-result-binding marker. Both scope objects are checked through the public scope identity builder; no parser, hash profile, or policy material serializer is duplicated here. The existing composition contract version is the only composition/algorithm pin currently defined. There is no separate algorithm version or authentic composition ID. The outer structural walk is bounded to depth 8, 1,024 traversed values, 256 UTF-16 code units per string, 24 properties per object and 64 elements per array; the reused scope builder separately enforces its 18,264-byte canonical-material bound and scope-specific member limits. The duplicated declaration is therefore bounded structurally, not by a new wire-byte profile.

The scope identity is a commitment to caller-supplied syntax. A caller can supply two matching but false declarations and receive syntax success. Policy `identifier/version/digest` references are not resolved against content, registry, approval, or the policy actually consumed. The scope builder's digest is not compared with a policy artifact. A parsed/copy-decoded declaration does not regain process-local authenticity. No boolean such as `applied`, `approved`, or `trusted` is accepted.

## What a future authentic application boundary must do

Evidence must be produced inside the module that applies the policy, from the exact validated inputs and selected algorithm, during the same evaluation. It must bind the expected scope and policy material to the actual policy content consumed, composition contract/algorithm version, cutoff, and exact result before source lineage is discarded by the view-model projection. A future producer must reject missing or mismatched evidence; it must not choose defaults, substitute a policy, accept a later caller declaration, or emit producer success for a blocked result. Empty output is not evidence of policy application.

The current composition input is `{ evaluationAsOf, candidates }`. It validates synthetic candidates and synthetic routing material, derives route behavior from the fixed source-portfolio decision, seals an in-memory queue set, and returns `NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION`. It has no explicit scope input, no application evidence, and no result-binding contract. Module-local authenticity protects that local object flow only; it does not prove source authority, policy approval, or equivalence between scope pins and policies used.

## Scope-dimension enforcement matrix

| Scope dimension | Existing tracked evidence | Missing enforcement | Future responsible module |
|---|---|---|---|
| Review purpose | Closed purpose enum and policy version in `event-intelligence-evidence-review-queue-scope-identity.ts`. | No canonical purpose policy content or check that composition implements it. | Approved review-purpose policy contract and the composition module applying it. |
| Jurisdiction set | Closed jurisdiction set in scope syntax; routing has jurisdiction routes and candidates carry jurisdiction. | No binding from the whole allowed set to the validated candidate set/result. Allowed jurisdictions need not all occur. | Authentic composition input validator; enforce membership for each included candidate without requiring every allowed value to appear. |
| Event representations | Closed event category set in scope syntax; routing has event-hint transitions. | No canonical representation policy or proof that each consumed event representation follows it. | Event normalization/composition policy application. |
| Asset representations | Bounded asset-representation identifiers in scope syntax; route material has synthetic mapping facts. | No applied asset representation or issuer/listing eligibility decision tied to scope policy content. | Approved mapping/issuer eligibility authority followed by composition. |
| Issuer/listing policy | Scope holds `{ policyId, version, canonicalMaterialDigest }`; syntax only. | No canonical policy-material profile/resolver, applied mapping output, or approval. | Future issuer/listing policy contract, resolver, and applying module. |
| Source portfolio | Scope holds the existing source-portfolio contract version and a caller-supplied digest; the routing module has a fixed decision and authentic local evaluations. | Scope digest is not checked against the decision material, and current composition does not bind an external scope pin to the decision it uses. The policy's route priority is ordered and must remain ordered. | Source-portfolio policy material contract plus composition's explicit applied-decision binding. |
| Routing policy | Scope holds a syntactic policy reference; current routing accepts synthetic scenario facts and uses its contract rules. | No canonical routing policy identity resolver or evidence that the exact scope-pinned rules governed each evaluation. Priority/transition order is policy semantics, not set membership. | Routing evaluator that applies the approved pinned policy. |
| Queue contract | Scope identifies the queue contract version and supplied digest; queue sealing uses a fixed local contract. | The digest is not checked against the queue contract material and no result records that this exact contract consumed the same scope. | Queue sealer/composition boundary with applied contract material binding. |
| Access classification | Closed classification enum and fixed policy-version syntax. | Classification is not user/tenant authorization, source-use rights, or approval. | Separately approved access/rights boundary; never inferred from queue composition. |

Membership dimensions (jurisdiction, event representation, asset representation) constrain which members may occur; they are not evidence that every permitted value was observed. Policy dimensions can encode ordered choices and precedence and must not be treated as sets. UI filters, receipt time, item counts and source artifact IDs are not scope-policy evidence.

An allowed source family or jurisdiction need not appear in a particular evaluation. Conversely, a family tag supplied in a declaration does not authenticate source type. A blocked composition remains blocked; neither this syntax parser nor an empty queue can turn it into application success. Access classification remains separate from authorization.

## Missing policy identity and result binding

Canonical material profiles do not exist for all scope policies. No generic `JSON.stringify` identity is adopted. Before a resolver can compare policy IDs, versions and digests to consumed content, a separately reviewed contract must define canonical material and version rules for each policy family. Existing source-portfolio and queue contract objects have local fixed material, but the caller-supplied scope digests are not verified against them by this slice.

Likewise, the existing composition `version` and `evaluationAsOf` are not unique result identities. The evidence contract records those declarations and marks result binding missing; it invents no composition ID, registry ID, fingerprint, WeakSet, token factory, or capability. A future authentic module boundary must define a non-replayable/local authenticity relationship (and a producer-verifiable binding) to the exact result. A serializable declaration submitted after evaluation cannot mint that relationship.

No default policy, silent substitution, caller assertion, or producer success is valid on a missing/mismatched policy. Approval and rights checks remain distinct gates. Application evidence does not replace authentic source classification, applied parent authority, provenance closure, correction/retraction lineage or origin independence. The view model remains lossy and non-authoritative. Application evidence cannot justify truncation: existing limits remain 512 view-model items, 128 manifest members, 1,048,576 snapshot bytes, 786,432 manifest bytes and 18,264 scope-material bytes; future overflow must fail atomically.

## Blocked production config and tests

The versioned production config fixes application-evidence activation to `BLOCKED`, selected application/producer/authority strategies to null, active application/scope/producer/provenance registries to empty, source/policy/producer/rights/storage/retention/deletion/access approvals to `NOT_APPROVED`, persistence/read/current-selection to `BLOCKED`, authority upgrade to `UNSUPPORTED`, and signal/trading to `BLOCKED`. Its parser accepts only the exact config. This is not a readiness calculator or runtime activation path.

Tests establish syntax acceptance/rejection, equality of expected and declared scope material, cutoff/version validation, getter-safe structural validation, output isolation, and rejection of config changes. They do not establish actual policy application, authenticity, approval, or producer readiness.

## Recommended next prerequisite

The next bounded prerequisite should define versioned canonical-material profiles and exact content-identity rules for the scope policy families, including how fixed source-portfolio and queue contract material maps to the scope pins. This comes before any policy resolver or applied-evidence runtime: today the scope builder accepts the digests as syntax, while composition carries neither scope nor policy bindings. No resolver or runtime is implemented here.
