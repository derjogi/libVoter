"use client";

import { CheckCircle, Star, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { CandidateMatch, EvidenceStatus, Source } from "@/types";
import { EvidenceSource } from "./EvidenceSource";

function EvidenceLane({
  heading,
  sources,
  status,
}: {
  heading: "Candidate evidence" | "Party evidence";
  sources: Source[];
  status: EvidenceStatus;
}) {
  const subject = heading === "Candidate evidence" ? "Candidate" : "Party";
  return (
    <section>
      <h3 className="mb-3 text-lg font-semibold">{heading}</h3>
      {sources.length > 0 ? (
        <div className="space-y-2">
          {sources.map((source) => (
            <EvidenceSource
              key={source.url}
              source={source}
              titleClassName="flex items-center justify-between gap-2 font-medium text-sm"
              iconClassName="h-4 w-4 shrink-0 text-muted-foreground"
            />
          ))}
        </div>
      ) : status === "empty" ? (
        <p className="text-sm text-muted-foreground">
          No {subject.toLowerCase()} evidence was found for this match.
        </p>
      ) : status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          {subject} evidence is currently unavailable.
        </p>
      ) : null}
    </section>
  );
}

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
      <DialogContent
        aria-describedby={undefined}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
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

          <Separator />
          <EvidenceLane
            heading="Candidate evidence"
            sources={candidate.candidateSources}
            status={candidate.candidateEvidenceStatus}
          />
          <Separator />
          <EvidenceLane
            heading="Party evidence"
            sources={candidate.partySources}
            status={candidate.partyEvidenceStatus}
          />

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
