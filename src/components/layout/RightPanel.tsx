"use client";

import { Landmark, TrendingUp, User, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CandidateList } from "@/components/candidates/CandidateList";
import { CandidateModal } from "@/components/candidates/CandidateModal";
import { ComparisonView } from "@/components/candidates/ComparisonView";
import { PartyList } from "@/components/candidates/PartyList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeUserPreferences } from "@/lib/actions/prompts";
import {
  countSubstantiveResponses,
  shouldRequestPreferenceSummary,
} from "@/lib/client/preference-summary-refresh";
import type { CandidateMatch, PartyMatch, UserResponse } from "@/types";

interface RightPanelProps {
  candidates: CandidateMatch[];
  /**
   * MMP party-vote matches (spec 019). Omitted / empty for non-MMP elections,
   * in which case the party-vote section is hidden and behavior is unchanged.
   */
  partyMatches?: PartyMatch[];
  confidence: number;
  /**
   * @deprecated The right panel is always visible per spec 005; this prop is
   * accepted for backward compatibility but ignored.
   */
  isVisible?: boolean;
  isMobile?: boolean;
  onCandidateSelect?: (candidate: CandidateMatch) => void;
  userResponses?: UserResponse[];
  /** Called when the user clicks "I'm ready to decide". */
  onReadyToDecide?: () => void;
}

export function RightPanel({
  candidates,
  partyMatches = [],
  confidence,
  isMobile = false,
  onCandidateSelect,
  userResponses = [],
  onReadyToDecide,
}: RightPanelProps) {
  // Only MMP elections seed party matches; non-MMP elections pass none, so the
  // party-vote section stays hidden and the panel behaves exactly as before.
  const showPartyVote = partyMatches.length > 0;
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateMatch | null>(null);
  const [comparisonCandidates, setComparisonCandidates] = useState<
    CandidateMatch[]
  >([]);
  const [showComparison, setShowComparison] = useState(false);
  const [preferenceSummary, setPreferenceSummary] = useState<string>("");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  // Monotonic id so a slow, in-flight summary request can't overwrite a newer
  // cadence-triggered request.
  const summarySeqRef = useRef(0);
  // The cadence is measured from the most recent request, including free-text
  // renewals, so an immediate renewal resets the two-answer interval.
  const lastSummaryRequestCountRef = useRef(0);

  const isLowConfidence = confidence < 60; // AI_CONFIDENCE_THRESHOLD

  const handleCandidateSelect = (candidate: CandidateMatch) => {
    setSelectedCandidate(candidate);
    onCandidateSelect?.(candidate);
  };

  const handleCompare = (candidate: CandidateMatch) => {
    const existingIndex = comparisonCandidates.findIndex(
      (c) => c.candidate.id === candidate.candidate.id,
    );
    if (existingIndex >= 0) {
      setComparisonCandidates((prev) =>
        prev.filter((_, i) => i !== existingIndex),
      );
    } else {
      setComparisonCandidates((prev) => [...prev, candidate]);
    }
  };

  const handleShowComparison = () => {
    if (comparisonCandidates.length > 1) {
      setShowComparison(true);
    }
  };

  const fetchPreferenceSummary = useCallback(
    async (responses: UserResponse[]) => {
      if (responses.length === 0) {
        setPreferenceSummary("");
        return;
      }

      const seq = ++summarySeqRef.current;
      setIsLoadingSummary(true);
      try {
        const result = await summarizeUserPreferences(responses);
        if (seq !== summarySeqRef.current) return; // superseded by a newer call
        if (result.success) {
          setPreferenceSummary(result.data || "");
        } else {
          console.error("Failed to fetch preference summary:", result.error);
        }
      } catch (error) {
        console.error("Error fetching preference summary:", error);
      } finally {
        if (seq === summarySeqRef.current) setIsLoadingSummary(false);
      }
    },
    [],
  );

  // Build after three substantive answers, then renew after two more answers
  // or immediately for chat/free-text input. Seat selection is setup only.
  useEffect(() => {
    const substantiveCount = countSubstantiveResponses(userResponses);
    if (substantiveCount === 0) {
      summarySeqRef.current += 1;
      lastSummaryRequestCountRef.current = 0;
      setPreferenceSummary("");
      setIsLoadingSummary(false);
      return;
    }

    if (
      !shouldRequestPreferenceSummary(
        userResponses,
        lastSummaryRequestCountRef.current,
      )
    ) {
      return;
    }

    lastSummaryRequestCountRef.current = substantiveCount;
    fetchPreferenceSummary(userResponses);
  }, [userResponses, fetchPreferenceSummary]);

  return (
    <>
      <div className={`space-y-4 ${isMobile ? "w-full" : ""}`}>
        {/* Preference Summary */}
        {userResponses.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <User className="mr-2 h-5 w-5" />
                Your Preferences Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {preferenceSummary ? (
                  <>
                    <div className="text-sm">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => <li>{children}</li>,
                          strong: ({ children }) => (
                            <strong className="font-semibold">
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => <em>{children}</em>,
                          h1: ({ children }) => (
                            <h3 className="mb-1 mt-2 font-semibold first:mt-0">
                              {children}
                            </h3>
                          ),
                          h2: ({ children }) => (
                            <h3 className="mb-1 mt-2 font-semibold first:mt-0">
                              {children}
                            </h3>
                          ),
                          h3: ({ children }) => (
                            <h3 className="mb-1 mt-2 font-semibold first:mt-0">
                              {children}
                            </h3>
                          ),
                        }}
                      >
                        {preferenceSummary}
                      </ReactMarkdown>
                    </div>
                    {isLoadingSummary && (
                      <p className="text-xs text-muted-foreground">
                        Updating summary...
                      </p>
                    )}
                  </>
                ) : isLoadingSummary ? (
                  <p className="text-sm text-muted-foreground">
                    Generating summary...
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Based on your {userResponses.length} response
                    {userResponses.length !== 1 ? "s" : ""}, we're analyzing
                    your preferences...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confidence Indicator */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Match Confidence
              </CardTitle>
              <Badge variant={isLowConfidence ? "secondary" : "default"}>
                {confidence}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Building matches...</span>
                <span>
                  {candidates.length} candidate
                  {candidates.length !== 1 ? "s" : ""} found
                </span>
              </div>
              {isLowConfidence && (
                <p className="text-sm text-muted-foreground">
                  Continue answering questions to improve match accuracy and see
                  more candidates.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Party vote (MMP only). Stacked above the electorate vote so the two
            ballots read top-to-bottom; both work on mobile without tabs. */}
        {showPartyVote && (
          <Card data-testid="party-matches">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Landmark className="mr-2 h-5 w-5" />
                Party Vote
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PartyList parties={partyMatches} confidence={confidence} />
            </CardContent>
          </Card>
        )}

        {/* Electorate / candidate vote. */}
        <Card data-testid="candidate-matches">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5" />
              {showPartyVote ? "Electorate Vote" : "Candidate Matches"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CandidateList
              candidates={candidates}
              confidence={confidence}
              onSelectCandidate={handleCandidateSelect}
            />
          </CardContent>
        </Card>

        {/* User control: stop any time. */}
        {onReadyToDecide && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onReadyToDecide}
              data-testid="ready-to-decide-btn"
            >
              I'm ready to decide
            </Button>
          </div>
        )}

        {/* Comparison Actions */}
        {comparisonCandidates.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {comparisonCandidates.length} candidate
                    {comparisonCandidates.length !== 1 ? "s" : ""} selected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Compare their positions and policies
                  </p>
                </div>
                <Button
                  onClick={handleShowComparison}
                  disabled={comparisonCandidates.length < 2}
                >
                  Compare
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Candidate Detail Modal */}
      <CandidateModal
        candidate={selectedCandidate}
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        onCompare={handleCompare}
      />

      {/* Comparison View */}
      {showComparison && (
        <ComparisonView
          candidates={comparisonCandidates}
          onClose={() => setShowComparison(false)}
          onSelectCandidate={handleCandidateSelect}
        />
      )}
    </>
  );
}
