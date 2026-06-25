"use client";

import { error } from "console";
import { TrendingUp, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { success } from "zod";
import { CandidateList } from "@/components/candidates/CandidateList";
import { CandidateModal } from "@/components/candidates/CandidateModal";
import { ComparisonView } from "@/components/candidates/ComparisonView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeUserPreferences } from "@/lib/actions/prompts";
import type { CandidateMatch, UserResponse } from "@/types";

interface RightPanelProps {
  candidates: CandidateMatch[];
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
  confidence,
  isMobile = false,
  onCandidateSelect,
  userResponses = [],
  onReadyToDecide,
}: RightPanelProps) {
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateMatch | null>(null);
  const [comparisonCandidates, setComparisonCandidates] = useState<
    CandidateMatch[]
  >([]);
  const [showComparison, setShowComparison] = useState(false);
  const [preferenceSummary, setPreferenceSummary] = useState<string>("");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

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

  const fetchPreferenceSummary = async (responses: UserResponse[]) => {
    if (responses.length === 0) {
      setPreferenceSummary("");
      return;
    }

    setIsLoadingSummary(true);
    try {
      // const result = await summarizeUserPreferences(responses);
      const result = { success: true, data: "Fake Summary", error: "" };
      if (result.success) {
        setPreferenceSummary(result.data || "");
      } else {
        console.error("Failed to fetch preference summary:", result.error);
        setPreferenceSummary("");
      }
    } catch (error) {
      console.error("Error fetching preference summary:", error);
      setPreferenceSummary("");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Update preference summary when user responses change
  useEffect(() => {
    fetchPreferenceSummary(userResponses);
  }, [userResponses]);

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
                {isLoadingSummary ? (
                  <p className="text-sm text-muted-foreground">
                    Generating summary...
                  </p>
                ) : preferenceSummary ? (
                  <p className="text-sm">{preferenceSummary}</p>
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

        {/* Candidates List */}
        <Card data-testid="candidate-matches">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5" />
              Candidate Matches
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
