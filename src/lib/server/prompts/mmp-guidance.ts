// Server-only: shared MMP two-vote prompt language (spec 020).
//
// NZ uses MMP, where every voter casts TWO independent votes — a party vote
// and an electorate vote. The advisor must reason about both without implying
// that the best party and the best local candidate are the same party. This
// guidance is injected into the live chat system preamble (chat-handler) and
// the prompt-manager system message, but ONLY for MMP elections, so non-MMP
// elections (e.g. Auckland 2025) keep their existing single-vote behavior.

import { type ElectionConfig, electionConfig } from "@/lib/config/election";

/** The two ballots an MMP voter casts, plus "both" for shared issues. */
export type VoteLane = "party" | "electorate" | "both";

/** True when the configured election uses MMP (two independent votes). */
export function isTwoVoteElection(
  config: ElectionConfig = electionConfig,
): boolean {
  return config.votingSystem === "mmp";
}

/**
 * MMP two-vote guidance for the system prompt. Returns "" for non-MMP
 * elections so their prompts are unchanged.
 */
export function mmpVotingGuidance(
  config: ElectionConfig = electionConfig,
): string {
  if (!isTwoVoteElection(config)) return "";

  return `This is an MMP election: every voter casts TWO independent votes.
1. PARTY VOTE — determines proportional party representation in Parliament. Judge each party as a whole.
2. ELECTORATE VOTE — chooses the local ${config.seatLabel} MP. Judge the individual candidate.
These are separate decisions: the best party match and the best local candidate need NOT be the same party, and you must never imply they have to be.
You may ask a question that targets the party vote, the electorate vote, or a shared issue that affects both. When useful, briefly explain how the two votes differ.
Tag each question you ask with which vote it informs.`;
}

/** Human-readable label for a vote-lane marker, used by the UI. */
export function voteLaneLabel(lane: VoteLane): string {
  switch (lane) {
    case "party":
      return "Informs your party vote";
    case "electorate":
      return "Informs your electorate vote";
    default:
      return "Informs both votes";
  }
}
