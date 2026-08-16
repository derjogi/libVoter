"use client";

import { ExternalLink, Info, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { CandidateMatch } from "@/types";

interface CandidateCardProps {
  candidate: CandidateMatch;
  onSelect: (candidate: CandidateMatch) => void;
  confidence: number;
  isLowConfidence?: boolean;
}

export function CandidateCard({
  candidate,
  onSelect,
  confidence,
  isLowConfidence = false,
}: CandidateCardProps) {
  const opacityClass = isLowConfidence ? "opacity-60" : "opacity-100";
  const selectCandidate = () => onSelect(candidate);

  return (
    // biome-ignore lint/a11y/useSemanticElements: A native button cannot contain the card's flow content.
    <Card
      role="button"
      tabIndex={0}
      aria-label={`View details for ${candidate.candidate.name}`}
      className={`w-full cursor-pointer transition-all duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${opacityClass} ${
        isLowConfidence ? "border-dashed" : ""
      }`}
      onClick={selectCandidate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          if (event.key === " ") event.preventDefault();
          selectCandidate();
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-lg leading-tight">
              {candidate.candidate.name}
            </h3>
            <Badge variant="secondary" className="mt-1">
              {candidate.candidate.party}
            </Badge>
          </div>
          <Info aria-hidden="true" className="m-2 h-4 w-4" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Match Score</span>
            <span className="text-sm font-bold text-primary">
              {candidate.score}%
            </span>
          </div>
          <Progress value={candidate.score} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium mb-2">Top Matching Policies</h4>
            <ul className="space-y-1">
              {candidate.topMatchingPolicies.slice(0, 3).map((policy) => (
                <li
                  key={policy}
                  className="text-sm text-muted-foreground flex items-center"
                >
                  <Star
                    aria-hidden="true"
                    className="h-3 w-3 mr-2 text-yellow-500 flex-shrink-0"
                  />
                  {policy}
                </li>
              ))}
            </ul>
          </div>

          {candidate.candidateSources.length + candidate.partySources.length >
            0 && (
            <div className="flex items-center text-xs text-muted-foreground">
              <ExternalLink aria-hidden="true" className="h-3 w-3 mr-1" />
              {candidate.candidateSources.length +
                candidate.partySources.length}{" "}
              source
              {candidate.candidateSources.length +
                candidate.partySources.length !==
              1
                ? "s"
                : ""}
            </div>
          )}

          {isLowConfidence && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              Match confidence is {confidence}%. More responses needed for
              accurate results.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
