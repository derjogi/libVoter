"use client";

import { useState } from "react";
// Type-only import (erased at build) — the evidence-chunk shape returned by
// the /api/rag/query endpoint.
import type {
  EvidenceChunk,
  EvidenceFilter,
} from "@/lib/server/rag/query-engine";

export function useRAGQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryEvidence = async (
    question: string,
    filter?: EvidenceFilter,
    maxResults?: number,
  ): Promise<EvidenceChunk[]> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, filter, maxResults }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Query failed");
      return (result.data?.chunks ?? []) as EvidenceChunk[];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { queryEvidence, loading, error };
}
