"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Transcript } from "@/components/dynamic/Transcript";
import { RightPanel } from "@/components/layout/RightPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rankCandidatesForSession } from "@/lib/actions/chat";
import {
  getCandidatesForSeat,
  getPartiesForCurrentElection,
  getSeatsForCurrentElection,
} from "@/lib/actions/database";
import { selectNextComponent } from "@/lib/actions/prompts";
import { extractVoterClaims } from "@/lib/actions/voter-claims";
import {
  toUnrankedMatches,
  toUnrankedPartyMatches,
} from "@/lib/client/candidate-match";
import { extractQuestionText } from "@/lib/client/extract-question-text";
import { useChat } from "@/lib/client/hooks/useChat";
import { politicalUserResponses } from "@/lib/client/voter-profile/response-history";
import {
  applyExtractionResult,
  failExtraction,
  recordResponse,
  selectRace,
} from "@/lib/client/voter-profile/session-reducer";
import { createSessionTurnGuard } from "@/lib/client/voter-profile/session-turn-guard";
import {
  hydrateTranscriptSteps,
  serializeTranscriptSteps,
} from "@/lib/client/voter-profile/transcript-snapshot";
import { startTurnPipeline } from "@/lib/client/voter-profile/turn-pipeline";
import {
  sessionReducerDependencies,
  useSessionSnapshot,
} from "@/lib/client/voter-profile/use-session-snapshot";
import { electionConfig } from "@/lib/config/election";
import { newTraceId } from "@/lib/debug/logging";
import type {
  Candidate,
  CandidateMatch,
  ComponentData,
  PartyMatch,
  PartySummary,
  RawAnswer,
  TranscriptStep,
  UserResponse,
} from "@/types";

export default function VotingAdvisor() {
  const [snapshot, setSnapshot, isStepsHydrated, clearSnapshot] =
    useSessionSnapshot();
  const [steps, setSteps] = useState<TranscriptStep[]>([]);
  const stepsRef = useRef<TranscriptStep[]>([]);
  const turnGuardRef = useRef<ReturnType<typeof createSessionTurnGuard> | null>(
    null,
  );
  if (!turnGuardRef.current) turnGuardRef.current = createSessionTurnGuard();
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [partyMatches, setPartyMatches] = useState<PartyMatch[]>([]);
  const [availableParties, setAvailableParties] = useState<PartySummary[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [seats, setSeats] = useState<string[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  // Monotonic ids for background ranking. Older results may update the UI while
  // a newer ranking is still pending, but once a newer result (or reset) has
  // applied, older in-flight results are ignored.
  const rankSeqRef = useRef(0);
  const appliedRankSeqRef = useRef(0);
  const [availableCandidates, setAvailableCandidates] = useState<Candidate[]>(
    [],
  );
  const transcriptHydratedRef = useRef(false);
  const hydratedRaceRef = useRef<string | null>(null);
  const shouldRehydrateRankingRef = useRef(false);
  const rehydratedRankingRef = useRef(false);

  const updateSteps = useCallback(
    (
      updater:
        | TranscriptStep[]
        | ((current: TranscriptStep[]) => TranscriptStep[]),
    ) => {
      const next =
        typeof updater === "function" ? updater(stepsRef.current) : updater;
      stepsRef.current = next;
      setSteps(next);
      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        updatedAt: sessionReducerDependencies.now(),
        transcriptSteps: serializeTranscriptSteps(next),
      }));
    },
    [setSnapshot],
  );

  // Pretty user-facing label for the seat (configured by the election).
  const seatLabel = electionConfig.seatLabel;

  // MMP elections have a second, independent party vote (spec 019). Non-MMP
  // elections never fetch/seed parties, so the party-vote lane stays hidden.
  const isMMP = electionConfig.votingSystem === "mmp";

  const { isLoading, sendMessage, clearChat, followupQuestion, voteLane } =
    useChat();

  // Human-readable label for the MMP vote-lane marker (spec 020). Inlined here
  // because the canonical helper lives in server-only code.
  const voteLaneLabel =
    voteLane === "party"
      ? "Informs your party vote"
      : voteLane === "electorate"
        ? "Informs your electorate vote"
        : voteLane === "both"
          ? "Informs both votes"
          : null;

  // `userResponses` is derived from the locked steps — it is what the LLM and
  // the right panel consume, so the transcript stays the single source of truth.
  const userResponses = useMemo<UserResponse[]>(
    () => politicalUserResponses(steps),
    [steps],
  );

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isStepsHydrated || transcriptHydratedRef.current) return;
    transcriptHydratedRef.current = true;
    shouldRehydrateRankingRef.current = snapshot.responses.some(
      (response) => response.kind === "political",
    );
    if (snapshot.transcriptSteps.length > 0) {
      const hydratedSteps = hydrateTranscriptSteps(
        snapshot.transcriptSteps,
        snapshot.responses,
      );
      stepsRef.current = hydratedSteps;
      setSteps(hydratedSteps);
    }
  }, [isStepsHydrated, snapshot.responses, snapshot.transcriptSteps]);

  useEffect(() => {
    const race = snapshot.selectedRace;
    if (!isStepsHydrated || !race || hydratedRaceRef.current === race) return;
    hydratedRaceRef.current = race;
    const sessionEpoch = turnGuardRef.current?.capture();
    if (sessionEpoch === undefined) return;
    getCandidatesForSeat(race)
      .then((result) => {
        if (!turnGuardRef.current?.isCurrent(sessionEpoch)) return;
        if (!result.success || !result.data) return;
        setAvailableCandidates(result.data);
        setCandidates(toUnrankedMatches(result.data));
      })
      .catch(() => {
        console.error("[ui:session-hydration] candidate reload failed");
      });
  }, [isStepsHydrated, snapshot.selectedRace]);

  // Fetch seats (seats) on mount.
  useEffect(() => {
    const fetchSeats = async () => {
      try {
        const result = await getSeatsForCurrentElection();
        if (result.success && result.data) setSeats(result.data);
      } catch {
        console.error("[ui:seats] fetch failed");
      } finally {
        setIsLoadingSeats(false);
      }
    };
    fetchSeats();
  }, []);

  // Fetch the party-vote lane (MMP only). Seeds unranked party cards so the
  // party-vote section is populated before any ranking exists, mirroring the
  // electorate-candidate Phase-1 behavior. Skips entirely for non-MMP.
  useEffect(() => {
    if (!isMMP) return;
    const fetchParties = async () => {
      try {
        const result = await getPartiesForCurrentElection();
        if (result.success && result.data) {
          setAvailableParties(result.data);
          // Only seed unranked cards if we don't already have a (persisted)
          // ranking from a previous turn.
          setPartyMatches((prev) =>
            prev.length > 0 ? prev : toUnrankedPartyMatches(result.data ?? []),
          );
        }
      } catch {
        console.error("[ui:parties] fetch failed");
      }
    };
    fetchParties();
  }, [isMMP]);

  // Build the initial seat-selection step.
  const buildSeatStep = useCallback(
    (): TranscriptStep => ({
      id: crypto.randomUUID(),
      locked: false,
      component: {
        type: "dropdown",
        data: {
          question: `Which ${electionConfig.seatLabel} do you live in?`,
          options: seats.map((seat) => ({
            id: seat,
            label: seat,
            description: "",
          })),
          placeholder: `Select your ${electionConfig.seatLabel}...`,
          questionId: "seat_selection",
        },
      },
    }),
    [seats],
  );

  // Seed the transcript with the seat step once persisted state has hydrated.
  useEffect(() => {
    if (
      isStepsHydrated &&
      steps.length === 0 &&
      snapshot.transcriptSteps.length === 0 &&
      !isLoadingSeats &&
      seats.length > 0
    ) {
      updateSteps([buildSeatStep()]);
    }
  }, [
    isStepsHydrated,
    steps.length,
    isLoadingSeats,
    seats,
    buildSeatStep,
    snapshot.transcriptSteps.length,
    updateSteps,
  ]);

  // Fire the (slow, RAG-backed) candidate ranking without blocking the chat
  // turn. The next question is already on screen; the panel + confidence update
  // when this resolves. Stale results are dropped via rankSeqRef.
  const runRanking = useCallback(
    (
      history: UserResponse[],
      candidates: Candidate[],
      parties: PartySummary[],
    ) => {
      // Run if there's anything to rank in either lane.
      if (
        (candidates.length === 0 && parties.length === 0) ||
        history.length === 0
      )
        return;
      const seq = ++rankSeqRef.current;
      const sessionEpoch = turnGuardRef.current?.capture();
      rankCandidatesForSession(history, candidates, parties)
        .then((ranking) => {
          if (
            sessionEpoch === undefined ||
            !turnGuardRef.current?.isCurrent(sessionEpoch)
          )
            return;
          if (seq < appliedRankSeqRef.current) return;
          appliedRankSeqRef.current = seq;
          setConfidence(ranking.confidence);
          setShowCandidates(ranking.shouldShowCandidates);
          if (ranking.candidateMatches.length > 0) {
            setCandidates(ranking.candidateMatches);
          }
          // Party vote is an independent lane — update it separately so its
          // scores never overwrite or get overwritten by candidate scores.
          if (ranking.partyMatches.length > 0) {
            setPartyMatches(ranking.partyMatches);
          }
        })
        .catch(() => {
          console.error("[ui:ranking] failed");
        });
    },
    [],
  );

  useEffect(() => {
    if (
      !isStepsHydrated ||
      !shouldRehydrateRankingRef.current ||
      rehydratedRankingRef.current ||
      availableCandidates.length === 0 ||
      (isMMP && availableParties.length === 0)
    ) {
      return;
    }
    rehydratedRankingRef.current = true;
    runRanking(userResponses, availableCandidates, availableParties);
  }, [
    availableCandidates,
    availableParties,
    isMMP,
    isStepsHydrated,
    runRanking,
    userResponses,
  ]);

  const handleComponentResponse = async (
    response: unknown,
    raw?: RawAnswer,
  ) => {
    // React state does not lock synchronously. The guard closes the double-click
    // window and its epoch invalidates every continuation when reset runs.
    const turnToken = turnGuardRef.current?.begin();
    if (turnToken === null || turnToken === undefined) return;
    const traceId = newTraceId("ui:componentResponse");
    const start = Date.now();
    let phase = "start";
    console.log(`[${traceId}] component response start`, {
      steps: stepsRef.current.length,
      availableCandidates: availableCandidates.length,
    });

    const fallbackChat: ComponentData = {
      type: "chat",
      data: {
        prompt: "Please tell me what is important to you.",
        placeholder: "Share some of your views…",
      },
    };

    const appendActive = (component: ComponentData) => {
      if (!turnGuardRef.current?.isCurrent(turnToken)) return;
      updateSteps((prev) => [
        ...prev,
        { id: crypto.randomUUID(), component, locked: false },
      ]);
    };

    try {
      const currentSteps = stepsRef.current;
      const active = currentSteps[currentSteps.length - 1];
      if (!active || active.locked) return;
      const comp = active.component;

      // Formatted value string fed to the LLM + stored on the response.
      const formatted: UserResponse["value"] =
        typeof response === "string"
          ? response
          : typeof response === "number" || typeof response === "boolean"
            ? response
            : Array.isArray(response)
              ? response
              : typeof response === "object" && response !== null
                ? JSON.stringify(response)
                : String(response);

      const rawQuestionId = (comp as { data?: { questionId?: string } })?.data
        ?.questionId;

      const responseId = crypto.randomUUID();
      const userResponse: UserResponse = {
        id: responseId,
        questionId: rawQuestionId ?? responseId,
        componentType: comp.type,
        value: formatted,
        timestamp: new Date(),
        confidence: 80,
        question: extractQuestionText(comp),
        componentData: comp,
      };

      // Lock the active step; compute the derived history synchronously.
      const lockedSteps = currentSteps.map((s, i) =>
        i === currentSteps.length - 1
          ? { ...s, locked: true, answer: raw, response: userResponse }
          : s,
      );
      // Compute once and commit both representations explicitly. In particular,
      // do not trigger setSnapshot from inside a setSteps updater (which React
      // may replay in development/Concurrent rendering).
      stepsRef.current = lockedSteps;
      setSteps(lockedSteps);
      setIsCompiling(true);

      const history = politicalUserResponses(lockedSteps);

      const isSeatSelection =
        comp.type === "dropdown" && comp.data.questionId === "seat_selection";
      const exactQuestion = extractQuestionText(comp);
      const exactAnswer =
        typeof formatted === "string" ? formatted : JSON.stringify(formatted);
      let committedSnapshot = recordResponse(snapshot, {
        id: responseId,
        question: exactQuestion,
        answer: exactAnswer,
        componentType: comp.type,
        submittedAt: new Date().toISOString(),
        kind: isSeatSelection ? "seat-selection" : "political",
      });
      committedSnapshot = {
        ...committedSnapshot,
        transcriptSteps: serializeTranscriptSteps(lockedSteps),
      };

      if (isSeatSelection) {
        const seatName =
          raw?.kind === "dropdown" ? raw.label : String(response);
        hydratedRaceRef.current = seatName;
        committedSnapshot = selectRace(
          committedSnapshot,
          seatName,
          sessionReducerDependencies,
        );
        setSnapshot(committedSnapshot);

        phase = "load-seat-candidates";
        console.log(`[${traceId}] ${phase}`);
        const candidatesResult = await getCandidatesForSeat(seatName);
        if (!turnGuardRef.current?.isCurrent(turnToken)) return;
        console.log(`[${traceId}] ${phase}:done`, {
          success: candidatesResult.success,
          count: candidatesResult.data?.length ?? 0,
        });
        const allCandidates = candidatesResult.success
          ? candidatesResult.data || []
          : [];
        setAvailableCandidates(allCandidates);

        // Phase 1 (spec 009): surface the electorate's candidates in the
        // right panel immediately, before any ranking exists. Shown as
        // unranked (neutral score) until later phases compute real matches.
        setCandidates(toUnrankedMatches(allCandidates));

        const candidateNames = allCandidates.map((c) => c.name);
        const conversationState = `I am voting in the ${seatName} ${seatLabel}, and the following candidates are running: \n${candidateNames.join(
          "\n",
        )}\n\nI have not stated any opinion yet. I want you to help me figure out which of these candidates I should vote for.`;

        phase = "select-next-component";
        console.log(`[${traceId}] ${phase}`, {
          allCandidates: allCandidates.length,
          seats: seats.length,
        });
        const componentResult = await selectNextComponent(conversationState);
        if (!turnGuardRef.current?.isCurrent(turnToken)) return;
        console.log(`[${traceId}] ${phase}:done`, {
          success: componentResult.success,
          validationFailed: componentResult.validationFailed,
          componentType: componentResult.data?.type,
        });
        if (componentResult.success && componentResult.data) {
          appendActive(componentResult.data);
        } else {
          console.warn("Component selection failed; using fallback chat");
          appendActive(fallbackChat);
        }
      } else {
        phase = "send-chat-message";
        setSnapshot(committedSnapshot);
        console.log(`[${traceId}] ${phase}`, {
          history: history.length,
          availableCandidates: availableCandidates.length,
        });
        const activeClaims = committedSnapshot.claims.filter(
          (claim) => claim.status === "active",
        );
        const acceptedClaims = activeClaims.map((claim, index) => ({
          alias: `claim-${index + 1}`,
          statement: claim.statement,
          conditions: claim.conditions,
          topicTags: claim.topicTags,
          importance: claim.confirmedImportance ?? claim.proposedImportance,
        }));
        const nextQuestionContext = {
          latest: { question: exactQuestion, answer: exactAnswer },
          acceptedClaims,
          askedCoverage: committedSnapshot.responses
            .filter((item) => item.kind === "political")
            .map((item) => ({ question: item.question, topicTags: [] })),
          confidence,
        };
        const pipeline = startTurnPipeline(
          () => sendMessage(nextQuestionContext, availableCandidates),
          () =>
            extractVoterClaims({
              responseId,
              baseProfileVersion: committedSnapshot.profileVersion,
              question: exactQuestion,
              answer: exactAnswer,
              activeClaims,
            }),
        );
        pipeline.extraction
          .then((result) => {
            if (!turnGuardRef.current?.isCurrent(turnToken)) return;
            setSnapshot((current) =>
              applyExtractionResult(
                current,
                result,
                sessionReducerDependencies,
              ),
            );
          })
          .catch(() => {
            if (!turnGuardRef.current?.isCurrent(turnToken)) return;
            setSnapshot((current) =>
              failExtraction(
                current,
                responseId,
                "Extraction failed. You can continue or reset this session.",
                sessionReducerDependencies,
              ),
            );
          });
        const aiResponse = await pipeline.question;
        if (!turnGuardRef.current?.isCurrent(turnToken)) return;
        console.log(`[${traceId}] ${phase}:done`, {
          hasResponse: !!aiResponse,
        });

        // Render the next question immediately — do NOT wait for ranking.
        appendActive(aiResponse?.nextComponent ?? fallbackChat);

        // Kick off candidate + party ranking in the background; the panel +
        // confidence update when it resolves (see runRanking). This keeps the
        // per-turn request short instead of blocking on the slow RAG ranking.
        runRanking(history, availableCandidates, availableParties);
      }
    } catch {
      if (!turnGuardRef.current?.isCurrent(turnToken)) return;
      console.error(`[${traceId}] component response failed`, {
        phase,
        elapsedMs: Date.now() - start,
      });
      appendActive(fallbackChat);
    } finally {
      console.log(`[${traceId}] component response finished`, {
        phase,
        elapsedMs: Date.now() - start,
      });
      if (turnGuardRef.current?.isCurrent(turnToken)) {
        setIsCompiling(false);
        turnGuardRef.current.finish(turnToken);
      }
    }
  };

  const handleCandidateSelect = (candidate: CandidateMatch) => {
    console.log("Selected candidate:", candidate);
  };

  const handleReset = () => {
    turnGuardRef.current?.reset();
    rankSeqRef.current += 1;
    appliedRankSeqRef.current = rankSeqRef.current;
    hydratedRaceRef.current = null;
    shouldRehydrateRankingRef.current = false;
    rehydratedRankingRef.current = false;
    clearChat();
    clearSnapshot();
    setCandidates([]);
    setConfidence(0);
    setShowCandidates(false);
    setAvailableCandidates([]);
    setIsCompiling(false);

    if (seats.length > 0) {
      updateSteps([buildSeatStep()]);
    } else {
      updateSteps([]);
    }

    // Re-seed unranked party cards so the party-vote lane stays populated after
    // a reset (the parties themselves don't change within an election).
    if (isMMP && availableParties.length > 0) {
      setPartyMatches(toUnrankedPartyMatches(availableParties));
    } else {
      setPartyMatches([]);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">AI Voting Advisor</h1>
              <p className="text-muted-foreground">
                {isMMP
                  ? "MMP has two votes: a party vote (who governs) and an electorate vote (your local MP). I'll help with both — they don't have to be the same party."
                  : "Discover candidates that match your values"}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={confidence > 60 ? "default" : "secondary"}>
                Confidence: {confidence}%
              </Badge>
              <Button variant="outline" size="sm" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-0">
          {/* Left Side - Conversation transcript */}
          <div
            className={`min-h-0 ${isMobile && showCandidates ? "hidden" : "flex flex-col"}`}
          >
            <Card className="flex-1 min-h-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <Badge variant="outline">
                    {userResponses.length} responses
                  </Badge>
                  {snapshot.extractions.some((item) =>
                    ["pending", "queued"].includes(item.status),
                  ) && (
                    <Badge variant="secondary" className="font-normal">
                      Updating your private profile…
                    </Badge>
                  )}
                  {isMMP && voteLaneLabel && (
                    <Badge variant="secondary" className="font-normal">
                      {voteLaneLabel}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col">
                {isLoadingSeats && steps.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">
                      Loading {electionConfig.seatLabelPlural}...
                    </p>
                  </div>
                ) : steps.length > 0 ? (
                  <Transcript
                    steps={steps}
                    onResponse={handleComponentResponse}
                    isCompiling={isCompiling}
                    isLoading={isLoading}
                    followupQuestion={followupQuestion}
                  />
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Loading…</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Candidate Matches (always visible per spec 005) */}
          <div
            className={`min-h-0 ${isMobile && !showCandidates ? "hidden" : "overflow-y-auto"}`}
          >
            <RightPanel
              candidates={candidates}
              partyMatches={partyMatches}
              confidence={confidence}
              isMobile={isMobile}
              onCandidateSelect={handleCandidateSelect}
              userResponses={userResponses}
              onReadyToDecide={() => setShowCandidates(true)}
            />
          </div>
        </div>

        {/* Mobile Toggle */}
        {isMobile && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="flex space-x-2">
              <Button
                variant={!showCandidates ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCandidates(false)}
              >
                Questions
              </Button>
              <Button
                variant={showCandidates ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCandidates(true)}
                disabled={candidates.length === 0}
              >
                Candidates ({candidates.length})
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>AI Voting Advisor — browser-local preference matching</p>
            <p className="mt-1">
              Your session stays in this browser. Answers and compact claims are
              sent to the configured AI provider, whose retention terms apply.
              Reset clears the local session.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
