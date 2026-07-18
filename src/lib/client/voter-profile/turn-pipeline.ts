export function startTurnPipeline<Question, Extraction>(
  startQuestion: () => Promise<Question>,
  startExtraction: () => Promise<Extraction>,
): { question: Promise<Question>; extraction: Promise<Extraction> } {
  const question = startQuestion();
  const extraction = startExtraction();
  return { question, extraction };
}
