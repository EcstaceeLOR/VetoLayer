import { z } from "zod";
import { ActorSchema, type Evidence } from "./schemas";

export const HumanReviewRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    decisionId: z.string().trim().min(1).max(200),
    reviewer: ActorSchema.refine((actor) => actor.kind === "human", {
      message: "Human review records require a human reviewer",
    }),
    action: z.enum(["approve", "reject", "request_evidence"]),
    rationale: z.string().trim().min(3).max(4_000),
    requestedEvidence: z.array(z.string().trim().min(1).max(500)).default([]),
    submittedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type HumanReviewRecord = z.infer<typeof HumanReviewRecordSchema>;

/**
 * Convert a human review into verified policy evidence. The review is evidence,
 * not a decision override; callers must re-run the normal orchestrator.
 */
export function humanReviewToEvidence(review: HumanReviewRecord): Evidence {
  const validated = HumanReviewRecordSchema.parse(review);
  return {
    id: `human-review-${validated.id}`,
    type: "review-approval",
    source: {
      kind: "vetolayer-human-review",
      label: "VetoLayer human review",
    },
    data: {
      reviewId: validated.id,
      decisionId: validated.decisionId,
      reviewer: {
        id: validated.reviewer.id,
        name: validated.reviewer.name ?? validated.reviewer.id,
      },
      action: validated.action,
      rationale: validated.rationale,
      requestedEvidence: validated.requestedEvidence,
      submittedAt: validated.submittedAt,
    },
    observedAt: validated.submittedAt,
    verification: {
      status: "verified",
      verifier: "vetolayer-review-loop",
      verifiedAt: validated.submittedAt,
    },
  };
}
