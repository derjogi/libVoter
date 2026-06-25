"use client";

import { CheckCircle, ExternalLink, Star, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { CandidateMatch } from "@/types";

interface CandidateModalProps {
  candidate: CandidateMatch | null;
  isOpen: boolean;
  onClose: () => void;
  onCompare?: (candidate: CandidateMatch) => void;
}

export function CandidateModal({
  candidate,
  isOpen,
  onClose,
  onCompare,
}: CandidateModalProps) {
  if (!candidate) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">
                {candidate.candidate.name}
              </DialogTitle>
              <Badge variant="secondary" className="mt-2">
                {candidate.candidate.party}
              </Badge>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary">
                {candidate.score}%
              </div>
              <div className="text-sm text-muted-foreground">Match Score</div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Explanation */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Why This Match?</h3>
            <p className="text-muted-foreground leading-relaxed">
              {candidate.reasoning}
            </p>
          </div>

          <Separator />

          {/* Pros and Cons */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center text-green-600">
                <CheckCircle className="mr-2 h-5 w-5" />
                Pros
              </h3>
              <ul className="space-y-2">
                {candidate.pros.map((pro) => (
                  <li key={pro} className="flex items-start">
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{pro}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center text-red-600">
                <XCircle className="mr-2 h-5 w-5" />
                Considerations
              </h3>
              <ul className="space-y-2">
                {candidate.cons.map((con) => (
                  <li key={con} className="flex items-start">
                    <XCircle className="mr-2 h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Separator />

          {/* Top Matching Policies */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              Top Matching Policies
            </h3>
            <div className="grid gap-3">
              {candidate.topMatchingPolicies.map((policy) => (
                <div
                  key={policy}
                  className="flex items-center p-3 bg-muted rounded-lg"
                >
                  <Star className="mr-3 h-4 w-4 text-yellow-500 flex-shrink-0" />
                  <span className="text-sm">{policy}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sources */}
          {candidate.sources && candidate.sources.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-3">Sources</h3>
                <div className="space-y-2">
                  {candidate.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center p-3 border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {source.title}
                        </div>
                        {source.date && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(source.date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            {onCompare && (
              <Button variant="outline" onClick={() => onCompare(candidate)}>
                Compare Candidates
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
