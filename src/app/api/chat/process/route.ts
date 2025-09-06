import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '@/lib/actions/chat';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory, userResponses } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const result = await processChatMessage(message, conversationHistory || [], userResponses || []);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}