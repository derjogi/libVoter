"use client";

import { useState } from "react";
import type { RAGContext } from "@/lib/server/rag/query-engine";

export function useRAGQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryContext = async (question: string, userContext?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, userContext }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Query failed");
      }

      return result.data as RAGContext;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    queryContext,
    loading,
    error,
  };
}
