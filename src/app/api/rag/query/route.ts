import { type NextRequest, NextResponse } from "next/server";
import { retrieveEvidence } from "@/lib/actions/rag";
import type { EvidenceFilter } from "@/lib/server/rag/vector-store";

export async function POST(request: NextRequest) {
  try {
    const { question, filter, maxResults } = (await request.json()) as {
      question?: string;
      filter?: EvidenceFilter;
      maxResults?: number;
    };

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "Question is required" },
        { status: 400 },
      );
    }

    const result = await retrieveEvidence(question, filter, maxResults);
    return NextResponse.json(result);
  } catch (error) {
    console.error("RAG API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
