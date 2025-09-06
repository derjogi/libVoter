'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ExternalLink, Info, Star } from 'lucide-react';
import type { CandidateMatch } from '@/types';

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
  isLowConfidence = false
}: CandidateCardProps) {
  const opacityClass = isLowConfidence ? 'opacity-60' : 'opacity-100';

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${opacityClass} ${
        isLowConfidence ? 'border-dashed' : ''
      }`}
      onClick={() => onSelect(candidate)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-lg leading-tight">{candidate.candidate.name}</h3>
            <Badge variant="secondary" className="mt-1">
              {candidate.candidate.party}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="p-1">
            <Info className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Match Score</span>
            <span className="text-sm font-bold text-primary">{candidate.score}%</span>
          </div>
          <Progress value={candidate.score} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium mb-2">Top Matching Policies</h4>
            <ul className="space-y-1">
              {candidate.topMatchingPolicies.slice(0, 3).map((policy, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-center">
                  <Star className="h-3 w-3 mr-2 text-yellow-500 flex-shrink-0" />
                  {policy}
                </li>
              ))}
            </ul>
          </div>

          {candidate.sources && candidate.sources.length > 0 && (
            <div className="flex items-center text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3 mr-1" />
              {candidate.sources.length} source{candidate.sources.length !== 1 ? 's' : ''}
            </div>
          )}

          {isLowConfidence && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              Match confidence is building... More responses needed for accurate results.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}