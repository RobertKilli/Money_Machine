# Evidence review queue snapshot codec

This slice adds `event-intelligence-evidence-review-queue-snapshot/v1`, a server-only, in-memory byte codec. It does not add a repository, storage read path, migration, provenance-member/seal runtime, current pointer, production wiring, or authority.

## Wire envelope

The exact envelope fields are `formatVersion`, `viewModelVersion`, `scopeIdentity`, `snapshotCutoff`, and `payload`. The scope identity uses the already documented syntactic `eviqs1_` plus 64 lowercase hexadecimal characters format. Acceptance checks only syntax; it does not prove that a scope is registered, approved, or that the payload covers its declared universe. `snapshotCutoff` is exactly `YYYY-MM-DDTHH:mm:ss.sssZ`, validated as a real UTC instant. It belongs to the snapshot, not the scope.

The payload is the existing `event-intelligence-evidence-review-queue-view-model/v1` shape and is validated through its existing strict serializable-model validator. A non-blocked payload's `generatedForAsOf` and each item's `evaluatedAsOf` must equal the envelope cutoff. The production blocked model has no evaluated cutoff (`generatedForAsOf: null`) and remains a valid blocked payload; the envelope cutoff records the requested snapshot boundary and does not turn that model into evidence or imply a successful evaluation. All cutoff-bound item snapshots remain historical; `superseded` remains its independent parent-model field. Correction and retraction states are preserved exactly.

## Canonical bytes and digest

Canonical JSON uses recursively sorted object keys by UTF-16 code-unit order, preserves array order, emits no whitespace/BOM/trailing newline, and uses JSON string escaping for already validated primitive strings. It performs no Unicode normalization. Lone UTF-16 surrogates, control/format characters, unsupported values, and negative zero are rejected. Numbers are limited to finite safe integers; negative zero is rejected rather than silently canonicalized to zero. The UTF-8 encoding is exact. SHA-256 lowercase hexadecimal is calculated over the complete canonical envelope bytes and returned separately; there is no digest field inside the envelope.

The digest identifies bytes only and can detect mismatch against an explicitly supplied expected digest. It proves neither authenticity nor origin independence, provenance, truth, completeness, scope approval, or authority. A syntactically valid decoded envelope is only `SYNTACTICALLY_VALID_NON_AUTHORITATIVE` data. Decode cannot reconstruct WeakSet/module-local trust or create an authentic queue set.

Decode order is: accept/cap/copy `Uint8Array`; validate expected lowercase SHA-256 format; hash exact received bytes and compare; reject UTF-8 BOM; fatal UTF-8 decode; parse JSON; validate exact envelope and parent view-model schema; enforce cutoff agreement; canonicalize and require byte-for-byte equality. There is no repair, partial result, or fallback. Duplicate JSON keys parse to a value but fail the final canonical byte comparison. Whitespace, reordered keys, alternative escapes, and other noncanonical encodings fail the same check.

## Bounds and errors

The codec caps bytes at 1,048,576, strings at 256 UTF-16 code units, arrays at 512 members, nesting at 16, and traversed nodes at 20,000. The parent view-model validator additionally caps items and label arrays and checks all labels, counts, statuses, timestamps, and summaries. Limits reject; no values are truncated, coerced, or dropped. `JSON.parse` is not streaming and the codec makes no constant-memory claim; the byte cap bounds its input before parsing.

Failures return one of the bounded error codes in the codec contract, never payload text or parser/crypto exceptions. Arbitrary hostile JavaScript Proxy objects are outside the codec's sandbox guarantee; Node proxy detection is used as a rejection guard, but this is not a general sandbox for caller code.

Encode copies and freezes the validated envelope and returns a separate byte-array copy. Decode copies input bytes before processing and returns a separately cloned, deep-frozen data envelope. Mutating caller input after a call cannot alter that result. Returned `Uint8Array` bytes are caller-owned mutable copies; callers must verify their digest whenever consuming them again.

## Deliberately unimplemented

This is local encoding/decoding only. Storage, snapshot provenance, members/seal enforcement, authoritative reread, persistence, scope registries, current selection, production loader integration, and rights/retention approvals remain blocked by the parent read-model and scope/provenance decisions. A valid digest is not a storage seal. Production config, loader, UI, and composition are unchanged; no fixture or synthetic queue is wired into production. The baseline dependency audit remains blocked by `GHSA-vfj7-8cjw-p6xm`; this checkpoint is not READY_FOR_PR.
