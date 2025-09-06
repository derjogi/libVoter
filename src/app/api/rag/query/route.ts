import { NextRequest, NextResponse } from 'next/server';
import { queryRAGContext } from '@/lib/actions/rag';

export async function POST(request: NextRequest) {
  try {
    const { question, userContext } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Question is required' },
        { status: 400 }
      );
    }

    const result = await queryRAGContext(question, userContext);

    return NextResponse.json(result);
  } catch (error) {
    console.error('RAG API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}