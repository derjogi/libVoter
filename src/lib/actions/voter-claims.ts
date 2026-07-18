"use server";

import { createChatModel, isMockMode } from "@/lib/server/ai/model-factory";
import {
  type ClaimExtractionInput,
  claimExtractionInputSchema,
  extractClaimsWithModel,
  type StructuredModel,
} from "@/lib/server/voter-claims/extraction";
import type { ExtractionResult } from "@/types/voter-claims.zod";

/**
 * Stateless boundary: validates/extracts one visible Q/A and returns a tagged
 * result. No voter data is retained server-side and logs contain metadata only.
 */
export async function extractVoterClaims(
  input: ClaimExtractionInput,
): Promise<ExtractionResult> {
  const startedAt = Date.now();
  try {
    const validatedInput = claimExtractionInputSchema.parse(input);
    const result = await extractClaimsWithModel(
      { ...validatedInput, mock: isMockMode() },
      createChatModel() as unknown as StructuredModel,
    );
    console.info("[claim-extraction] completed", {
      elapsedMs: Date.now() - startedAt,
      operationCount: result.operations.length,
      mock: isMockMode(),
    });
    return result;
  } catch {
    console.error("[claim-extraction] failed", {
      elapsedMs: Date.now() - startedAt,
    });
    throw new Error("Claim extraction failed");
  }
}
