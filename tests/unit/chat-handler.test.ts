// Drive the AIChatHandler through MockChatModel to verify the spec-001 fix:
// processMessage no longer throws ReferenceError, returns a valid ChatResponse,
// and follows the AI_MODE=mock fixtures.
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  // Force mock mode before importing anything that constructs a model.
  process.env.AI_MODE = 'mock';
});

describe('AIChatHandler.processMessage (mock mode)', () => {
  it('returns a valid ChatResponse without throwing', async () => {
    const { AIChatHandler } = await import('@/lib/server/ai/chat-handler');
    const handler = new AIChatHandler();

    const result = await handler.processMessage(
      'I care about housing affordability.',
      [],
      [],
      []
    );

    expect(result).toBeDefined();
    expect(typeof result.message).toBe('string');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.shouldShowCandidates).toBe('boolean');
    // Mock COMPONENT_SELECTOR fixture is a multiselect.
    expect(result.nextComponent?.type).toBeDefined();
  });

  it('survives a multi-turn conversation', async () => {
    const { AIChatHandler } = await import('@/lib/server/ai/chat-handler');
    const handler = new AIChatHandler();

    const turn1 = await handler.processMessage('Housing.', [], [], []);
    const turn2 = await handler.processMessage(
      'And transport too.',
      [
        { id: '1', role: 'user', content: 'Housing.', timestamp: new Date() },
        { id: '2', role: 'assistant', content: turn1.message, timestamp: new Date() },
      ],
      [
        {
          id: 'r1',
          questionId: 'q1',
          componentType: 'chat',
          value: 'Housing.',
          timestamp: new Date(),
        },
      ],
      []
    );

    expect(turn2.message).toBeDefined();
    expect(turn2.confidence).toBeGreaterThanOrEqual(0);
  });
});
