import { describe, it, expect } from 'vitest';
import { ConfidenceCalculator } from '@/lib/server/ai/confidence-calculator';
import type { UserResponse } from '@/types';

function makeResponse(value: any, id = 'q'): UserResponse {
  return {
    id: `r-${Math.random()}`,
    questionId: id,
    componentType: 'chat',
    value,
    timestamp: new Date(),
  };
}

describe('ConfidenceCalculator', () => {
  it('returns 0-ish score for no responses', () => {
    const result = ConfidenceCalculator.calculate([], []);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(40);
  });

  it('rises with more responses on multiple topics', () => {
    const responses: UserResponse[] = [
      makeResponse('I care about housing and the economy.'),
      makeResponse('Healthcare is also important.'),
      makeResponse('Environment and education matter to me.'),
      makeResponse('Taxes should be lowered.'),
    ];
    const result = ConfidenceCalculator.calculate(responses, []);
    expect(result.score).toBeGreaterThan(40);
    expect(result.factors.topicCoverage).toBeGreaterThan(0);
    expect(result.factors.interactionCount).toBe(100);
  });

  it('caps score at 100 and floors at 0', () => {
    const overflow = Array.from({ length: 50 }, () =>
      makeResponse(
        'A long thoughtful response about housing, healthcare, education, environment, taxes, immigration, foreign policy, social security, economy, government policy in detail.'
      )
    );
    const result = ConfidenceCalculator.calculate(overflow, []);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('produces a non-empty reasoning string', () => {
    const r = ConfidenceCalculator.calculate([makeResponse('housing')], []);
    expect(typeof r.reasoning).toBe('string');
    expect(r.reasoning.length).toBeGreaterThan(0);
  });
});
