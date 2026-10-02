# SEC EDGAR document artifact authority conflicts

Checkpoint evidence verified locally on 2026-10-02 at baseline `52c51b91cb2b62b69adc702bae57342d6c4d843a`, before finalization commit/push. Production remains `BLOCKED_BACKEND_UNAPPROVED`. The subsequent complete A–G runs and their exact maps are in the [runtime verification report](SEC_EDGAR_EVENT_SOURCE_PROVENANCE_RUNTIME_VERIFICATION.md).

The real fixture application and PostgreSQL UoW first commit this baseline artifact. Every negative case then compares the entire artifact row (including material and joined profile binding) from a fresh connection to its pre-transaction snapshot:

```json
{
  "artifactId": "e42471c64e4d24ce371ee84b33b098fc50ece1e2c49c9e105a8e89a81296b398",
  "fingerprint": "fd49d4b275acef543704f7ba04c090fce5dfa491f83107914939ec40e8e6f94d",
  "blobId": "sha256:712c3909bf37d2a7fa25d9e2d4e8d25985915ea7e19e7b97b3308c8516f020b9:444",
  "filingIdentityId": "bb0d13427dfc870495f993e5fd16633b6bf5b7e02730ebd90de54d45e293b9a9",
  "profileId": "sec-edgar-synthetic-fixture-profile/v1",
  "locator": "/synthetic-edgar/archive/SYNTH-CIK-0001/SYNTH-ACC-AGREE-0001/agreement.txt",
  "role": "PRIMARY_DOCUMENT"
}
```

| Changed dimension | Valid alternative material | Application construction | Persistence test |
| --- | --- | --- | --- |
| Content blob | A different committed blob from an authenticated synthetic package; actual bytes differ, lowercase digest and byte length are verified by the real UoW. Filing, locator, role and type remain stable. | Regenerates document ID. | Force only the baseline ID in the private persistence record. |
| Locator | Canonical, unused filename under the same CIK/accession; no traversal, same blob and role. | Regenerates document ID. | Same private record seam. |
| Document role | Primary becomes allowed EXHIBIT with compatible type; the authenticated construction has another primary so the package remains structurally valid. | Regenerates document ID. | Role/type conflict at the same private record seam. |
| Source profile | Complete canonical alternative profile and filing parent committed first. The profile change also changes the filing identity; locator, blob and document fields remain stable. | The approved synthetic-profile allowlist rejects the alternative; recomputing identity would also change document ID. | Profile/filing-scope conflict, not a claim that only one physical artifact column changes. |
| Filing identity | New original filing under the same valid profile; its locator follows the new accession's canonical path. No competing artifact occupies that locator. | Regenerates filing and document IDs. | Filing/locator-scope conflict at the same private record seam. |

All five are `UNREACHABLE_BY_AUTHENTICATED_CONSTRUCTION` with a reused document ID. Tests use the UoW's private insert/reread operation via an integration-loader-only export. The production module has no such export, and the candidate persistence record is explicitly not a trusted runtime batch. The ordinary authenticated batch guard is preserved.

Every case enters one real `READ COMMITTED` transaction, first writes a separate authenticated canary authority-set, then invokes the authentic baseline UoW and its existing `BLOB_VERIFIED` phase observer. The private artifact operation completes an idempotent INSERT with zero returned rows, selects exactly one baseline artifact, and rejects the alternate material at authoritative reread. No SQL constraint or immutable trigger is disabled.

The error is `SEC_EVENT_DOCUMENT_ARTIFACT_AUTHORITY_CONFLICT`, with no SQLSTATE. The same Error instance propagates from the private operation through the UoW and transaction. A new connection verifies exact eleven-table before/after counts, unchanged baseline artifact, and no canary filing. The canary creates real new rows in all ten non-profile authority/member tables; source profile is legitimately reused and its count is also checked.

Verification: five focused conflict tests PASS; complete existing D-F selection PASS twice without reset (8 tests each; 29 A-C/other tests skipped); runtime unit tests 39 PASS twice; SEC provenance/fixture/byte-storage regressions 47 PASS; typecheck, lint and diff check PASS. A new isolated Supabase CLI 2.117.0 PostgreSQL 17.6 database applied all 37 migrations and `db reset --local --no-seed`. The existing E/F test code is unchanged; these runs reconfirm existing coverage, and add no new E/F claims. No full suite, build, advisors or G tests ran.

Exact count maps for both complete D-F runs follow. Alternative-parent setup commits precede the negative transaction, so global counts may grow between processes. Within each case `before` and `after` are exact and identical:

```json
[
  {
    "run": "df-run-1",
    "cases": [
      {
        "cases": [
          "blob",
          "locator",
          "document role"
        ],
        "before": {
          "sec_event_source_profiles": 2,
          "sec_event_filing_identities": 5,
          "sec_event_acquisition_requests": 3,
          "sec_event_acquisition_attempts": 3,
          "sec_event_content_blobs": 6,
          "sec_event_document_artifacts": 9,
          "sec_event_filing_packages": 3,
          "sec_event_package_document_members": 9,
          "sec_event_acquisition_receipts": 3,
          "sec_event_source_lineages": 3,
          "sec_event_source_lineage_members": 9
        },
        "after": {
          "sec_event_source_profiles": 2,
          "sec_event_filing_identities": 5,
          "sec_event_acquisition_requests": 3,
          "sec_event_acquisition_attempts": 3,
          "sec_event_content_blobs": 6,
          "sec_event_document_artifacts": 9,
          "sec_event_filing_packages": 3,
          "sec_event_package_document_members": 9,
          "sec_event_acquisition_receipts": 3,
          "sec_event_source_lineages": 3,
          "sec_event_source_lineage_members": 9
        }
      },
      {
        "cases": [
          "source profile"
        ],
        "before": {
          "sec_event_source_profiles": 3,
          "sec_event_filing_identities": 6,
          "sec_event_acquisition_requests": 3,
          "sec_event_acquisition_attempts": 3,
          "sec_event_content_blobs": 6,
          "sec_event_document_artifacts": 9,
          "sec_event_filing_packages": 3,
          "sec_event_package_document_members": 9,
          "sec_event_acquisition_receipts": 3,
          "sec_event_source_lineages": 3,
          "sec_event_source_lineage_members": 9
        },
        "after": {
          "sec_event_source_profiles": 3,
          "sec_event_filing_identities": 6,
          "sec_event_acquisition_requests": 3,
          "sec_event_acquisition_attempts": 3,
          "sec_event_content_blobs": 6,
          "sec_event_document_artifacts": 9,
          "sec_event_filing_packages": 3,
          "sec_event_package_document_members": 9,
          "sec_event_acquisition_receipts": 3,
          "sec_event_source_lineages": 3,
          "sec_event_source_lineage_members": 9
        }
      },
      {
        "cases": [
          "filing identity"
        ],
        "before": {
          "sec_event_source_profiles": 3,
          "sec_event_filing_identities": 7,
          "sec_event_acquisition_requests": 3,
          "sec_event_acquisition_attempts": 3,
          "sec_event_content_blobs": 6,
          "sec_event_document_artifacts": 9,
          "sec_event_filing_packages": 3,
          "sec_event_package_document_members": 9,
          "sec_event_acquisition_receipts": 3,
          "sec_event_source_lineages": 3,
          "sec_event_source_lineage_members": 9
        },
        "after": {
          "sec_event_source_profiles": 3,
          "sec_event_filing_identities": 7,
          "sec_event_acquisition_requests": 3,
          "sec_event_acquisition_attempts": 3,
          "sec_event_content_blobs": 6,
          "sec_event_document_artifacts": 9,
          "sec_event_filing_packages": 3,
          "sec_event_package_document_members": 9,
          "sec_event_acquisition_receipts": 3,
          "sec_event_source_lineages": 3,
          "sec_event_source_lineage_members": 9
        }
      }
    ]
  },
  {
    "run": "df-run-2",
    "cases": [
      {
        "cases": [
          "blob",
          "locator",
          "document role"
        ],
        "before": {
          "sec_event_source_profiles": 3,
          "sec_event_filing_identities": 11,
          "sec_event_acquisition_requests": 7,
          "sec_event_acquisition_attempts": 8,
          "sec_event_content_blobs": 11,
          "sec_event_document_artifacts": 19,
          "sec_event_filing_packages": 8,
          "sec_event_package_document_members": 21,
          "sec_event_acquisition_receipts": 8,
          "sec_event_source_lineages": 9,
          "sec_event_source_lineage_members": 22
        },
        "after": {
          "sec_event_source_profiles": 3,
          "sec_event_filing_identities": 11,
          "sec_event_acquisition_requests": 7,
          "sec_event_acquisition_attempts": 8,
          "sec_event_content_blobs": 11,
          "sec_event_document_artifacts": 19,
          "sec_event_filing_packages": 8,
          "sec_event_package_document_members": 21,
          "sec_event_acquisition_receipts": 8,
          "sec_event_source_lineages": 9,
          "sec_event_source_lineage_members": 22
        }
      },
      {
        "cases": [
          "source profile"
        ],
        "before": {
          "sec_event_source_profiles": 4,
          "sec_event_filing_identities": 12,
          "sec_event_acquisition_requests": 7,
          "sec_event_acquisition_attempts": 8,
          "sec_event_content_blobs": 11,
          "sec_event_document_artifacts": 19,
          "sec_event_filing_packages": 8,
          "sec_event_package_document_members": 21,
          "sec_event_acquisition_receipts": 8,
          "sec_event_source_lineages": 9,
          "sec_event_source_lineage_members": 22
        },
        "after": {
          "sec_event_source_profiles": 4,
          "sec_event_filing_identities": 12,
          "sec_event_acquisition_requests": 7,
          "sec_event_acquisition_attempts": 8,
          "sec_event_content_blobs": 11,
          "sec_event_document_artifacts": 19,
          "sec_event_filing_packages": 8,
          "sec_event_package_document_members": 21,
          "sec_event_acquisition_receipts": 8,
          "sec_event_source_lineages": 9,
          "sec_event_source_lineage_members": 22
        }
      },
      {
        "cases": [
          "filing identity"
        ],
        "before": {
          "sec_event_source_profiles": 4,
          "sec_event_filing_identities": 13,
          "sec_event_acquisition_requests": 7,
          "sec_event_acquisition_attempts": 8,
          "sec_event_content_blobs": 11,
          "sec_event_document_artifacts": 19,
          "sec_event_filing_packages": 8,
          "sec_event_package_document_members": 21,
          "sec_event_acquisition_receipts": 8,
          "sec_event_source_lineages": 9,
          "sec_event_source_lineage_members": 22
        },
        "after": {
          "sec_event_source_profiles": 4,
          "sec_event_filing_identities": 13,
          "sec_event_acquisition_requests": 7,
          "sec_event_acquisition_attempts": 8,
          "sec_event_content_blobs": 11,
          "sec_event_document_artifacts": 19,
          "sec_event_filing_packages": 8,
          "sec_event_package_document_members": 21,
          "sec_event_acquisition_receipts": 8,
          "sec_event_source_lineages": 9,
          "sec_event_source_lineage_members": 22
        }
      }
    ]
  }
]
```
