"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PartyMatch } from "@/types";

interface PartyListProps {
  parties: PartyMatch[];
  /** Ranking-derived confidence; dims cards while still "building". */
  confidence: number;
}

/**
 * MMP party-vote lane (spec 019). Renders ranked party cards independently of
 * the electorate-candidate list, so the two votes are never conflated. Party
 * ranking starts heuristic/LLM-backed; evidence-backed citations arrive with
 * spec 009.
 */
export function PartyList({ parties, confidence }: PartyListProps) {
  const isLowConfidence = confidence < 60; // AI_CONFIDENCE_THRESHOLD

  if (parties.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          No parties available yet. Continue answering questions to see how the
          parties match your party vote.
        </p>
      </div>
    );
  }

  // Already sorted by score from the ranking pass; keep that order.
  const sorted = [...parties].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-3">
      {sorted.map((match) => {
        const opacityClass = isLowConfidence ? "opacity-60" : "opacity-100";
        return (
          <Card
            key={match.party.id}
            className={`transition-all duration-200 ${opacityClass} ${
              isLowConfidence ? "border-dashed" : ""
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-base leading-tight">
                    {match.party.name}
                  </h3>
                  {match.party.leader && (
                    <Badge variant="secondary" className="mt-1">
                      {match.party.leader}
                    </Badge>
                  )}
                </div>
                <span className="text-sm font-bold text-primary">
                  {match.score}%
                </span>
              </div>
              <Progress value={match.score} className="h-2" />
            </CardHeader>

            {(match.reasoning || match.sources.length > 0) && (
              <CardContent className="pt-0 space-y-2">
                {match.reasoning && (
                  <p className="text-sm text-muted-foreground">
                    {match.reasoning}
                  </p>
                )}
                {match.sources.length > 0 && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {match.sources.length} source
                    {match.sources.length !== 1 ? "s" : ""}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
