# Offline snapshot roundtrip demonstration

The development-only `/intelligence/events/review/offline-demo/snapshot` page reuses the later fixed temporal replay episode. Its synthetic discovery fixtures pass through the existing routing, one queue composition, and one view-model projection before the existing snapshot codec encodes the payload in memory.

The demo builds fixed syntactic scope material separately from the snapshot envelope, then checks the encoded bytes and scope with the existing snapshot/scope-binding verifier. The expected digest is the digest returned by that local encode operation. Policy references and digest strings are syntax-only declarations; this flow does not resolve policy content or demonstrate policy application.

Two isolated controls show bounded failures: changed bytes paired with the original digest fail codec integrity with `DIGEST_MISMATCH`; a canonical snapshot with another valid scope and its own correct digest passes codec decoding, then fails the separate original scope expectation with `SNAPSHOT_SCOPE_MISMATCH`.

No artifact is written, read from storage, uploaded, or downloaded. There is no authenticated external expected digest, provenance manifest, producer-readiness, or restored module-local candidate binding. The decoded payload is presentation data only; it cannot recover routing, composition, queue, source context, or private candidate identity. Local byte integrity and syntactic scope equality are non-authoritative and do not approve a candidate.
