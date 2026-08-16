"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EvidenceStatus, PartyMatch } from "@/types";
import { EvidenceSource, evidenceSourceKey } from "./EvidenceSource";

interface PartyModalProps {
  party: PartyMatch | null;
  isOpen: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

const statusCopy: Record<Exclude<EvidenceStatus, "available">, string> = {
  empty: "No party evidence was found for this match.",
  unavailable: "Party evidence is currently unavailable.",
};

export function PartyModal({
  party,
  isOpen,
  onClose,
  returnFocusTo,
}: PartyModalProps) {
  if (!party) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo) return;
          event.preventDefault();
          returnFocusTo.focus();
        }}
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">{party.party.name}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2">
            {party.party.leader && (
              <Badge variant="secondary">Leader: {party.party.leader}</Badge>
            )}
            <span className="font-bold text-primary">{party.score}% match</span>
          </div>
        </DialogHeader>
        <div className="space-y-5">
          <section aria-labelledby="party-reasoning-heading">
            <h3
              id="party-reasoning-heading"
              className="mb-2 text-lg font-semibold"
            >
              Why this party match?
            </h3>
            <p className="leading-relaxed text-muted-foreground">
              {party.reasoning}
            </p>
          </section>
          <section aria-labelledby="party-evidence-heading">
            <h3
              id="party-evidence-heading"
              className="mb-3 text-lg font-semibold"
            >
              Party evidence
            </h3>
            {party.sources.length > 0 ? (
              <div className="space-y-3">
                {party.sources.map((source) => (
                  <EvidenceSource
                    key={evidenceSourceKey(source)}
                    source={source}
                    titleClassName="flex items-center justify-between gap-2 font-medium"
                    iconClassName="h-4 w-4 shrink-0"
                  />
                ))}
              </div>
            ) : party.evidenceStatus !== "available" ? (
              <p className="text-sm text-muted-foreground">
                {statusCopy[party.evidenceStatus]}
              </p>
            ) : null}
          </section>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
