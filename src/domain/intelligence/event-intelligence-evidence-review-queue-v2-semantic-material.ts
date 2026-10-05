import "server-only";

import {
  EVIDENCE_REVIEW_QUEUE_V2_VERSION,
  getEvidenceReviewQueueV2Contract,
} from "./event-intelligence-evidence-review-queue";

export const EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL_SCHEMA_VERSION =
  "event-intelligence-evidence-review-queue-semantic-material-contract/v2" as const;
export const EVIDENCE_REVIEW_QUEUE_V2_MATERIAL_PROFILE_VERSION =
  "event-intelligence-evidence-review-queue-policy-material/v2" as const;
export const EVIDENCE_REVIEW_QUEUE_V2_ALGORITHM_VERSION =
  "event-intelligence-evidence-review-queue-classification-algorithm/v2" as const;

const contract = getEvidenceReviewQueueV2Contract();

/** Static, explanatory v2 material. It is not a policy resolver or a code-equivalence proof. */
export const EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL = Object.freeze({
  schemaVersion: EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL_SCHEMA_VERSION,
  materialProfileVersion: EVIDENCE_REVIEW_QUEUE_V2_MATERIAL_PROFILE_VERSION,
  algorithmVersion: EVIDENCE_REVIEW_QUEUE_V2_ALGORITHM_VERSION,
  queueContractVersion: EVIDENCE_REVIEW_QUEUE_V2_VERSION,
  classifierOrder: contract.classifierOrder,
  priorityMapping: contract.priorityMapping,
  blockerMappings: contract.blockerMappings,
  conflictActionOrder: contract.conflictActionOrder,
  blockerPolicy: contract.blockerPolicy,
  priorityOrder: contract.priorityOrder,
  sorting: contract.ordering,
  historicalPolicy: contract.historicalPolicy,
  closure: Object.freeze({
    status: "PARTIALLY_CLOSED" as const,
    aligned: Object.freeze([
      "LIFECYCLE_CONFLICT_PRECEDES_AMOUNT_CURRENCY_CONFLICT",
      "CLASSIFIER_CONDITION_ORDER_AND_FALLBACK_MATCH_THE_V2_EVALUATOR",
    ]),
    open: contract.boundaries,
    evidenceLimit: "CONFORMANCE_TESTS_DO_NOT_PROVE_FULL_CODE_EQUIVALENCE_OR_LATER_POLICY_APPLICATION",
  }),
});
