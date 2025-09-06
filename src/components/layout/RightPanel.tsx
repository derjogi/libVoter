'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CandidateList } from '@/components/candidates/CandidateList';
import { CandidateModal } from '@/components/candidates/CandidateModal';
import { ComparisonView } from '@/components/candidates/ComparisonView';
import { TrendingUp, Users } from 'lucide-react';
import type { CandidateMatch } from '@/types';

interface RightPanelProps {
  candidates: CandidateMatch[];
  confidence: number;
  isVisible: boolean;
  isMobile?: boolean;
  onCandidateSelect?: (candidate: CandidateMatch) => void;
}

export function RightPanel({
  candidates,
  confidence,
  isVisible,
  isMobile = false,
  onCandidateSelect
}: RightPanelProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateMatch | null>(null);
  const [comparisonCandidates, setComparisonCandidates] = useState<CandidateMatch[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  const isLowConfidence = confidence < 60; // AI_CONFIDENCE_THRESHOLD

  const handleCandidateSelect = (candidate: CandidateMatch) => {
    setSelectedCandidate(candidate);
    onCandidateSelect?.(candidate);
  };

  const handleCompare = (candidate: CandidateMatch) => {
    const existingIndex = comparisonCandidates.findIndex(c => c.candidate.id === candidate.candidate.id);
    if (existingIndex >= 0) {
      setComparisonCandidates(prev => prev.filter((_, i) => i !== existingIndex));
    } else {
      setComparisonCandidates(prev => [...prev, candidate]);
    }
  };

  const handleShowComparison = () => {
    if (comparisonCandidates.length > 1) {
      setShowComparison(true);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <div className={`space-y-4 ${isMobile ? 'w-full' : ''}`}>
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
                <span>{candidates.length} candidate{candidates.length !== 1 ? 's' : ''} found</span>
              </div>
              {isLowConfidence && (
                <p className="text-sm text-muted-foreground">
                  Continue answering questions to improve match accuracy and see more candidates.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Candidates List */}
        <Card>
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

        {/* Comparison Actions */}
        {comparisonCandidates.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {comparisonCandidates.length} candidate{comparisonCandidates.length !== 1 ? 's' : ''} selected
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