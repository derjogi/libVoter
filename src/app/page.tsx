"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Transcript } from "@/components/dynamic/Transcript";
import { RightPanel } from "@/components/layout/RightPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rankCandidatesForSession } from "@/lib/actions/chat";
import {
  getCandidatesByWard,
  getMayorCandidates,
  getSeatsForCurrentElection,
} from "@/lib/actions/database";
import { selectNextComponent } from "@/lib/actions/prompts";
import { toUnrankedMatches } from "@/lib/client/candidate-match";
import { extractQuestionText } from "@/lib/client/extract-question-text";
import { useChat } from "@/lib/client/hooks/useChat";
import { usePersistedState } from "@/lib/client/hooks/usePersistedState";
import { electionConfig } from "@/lib/config/election";
import type { Candidate } from "@/lib/db/schema";
import { newTraceId, serializeError } from "@/lib/debug/logging";
import type {
  CandidateMatch,
  ComponentData,
  RawAnswer,
  TranscriptStep,
  UserResponse,
} from "@/types";

export default function VotingAdvisor() {
  const [steps, setSteps, isStepsHydrated, clearStoredSteps] =
    usePersistedState<TranscriptStep[]>("session:steps", []);
  const [candidates, setCandidates, , clearStoredCandidates] =
    usePersistedState<CandidateMatch[]>("session:candidates", []);
  const [confidence, setConfidence, , clearStoredConfidence] =
    usePersistedState<number>("session:confidence", 0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCandidates, setShowCandidates, , clearStoredShowCandidates] =
    usePersistedState<boolean>("session:showCandidates", false);
  const [seats, setSeats] = useState<string[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  // Monotonic id so a slow ranking call that resolves after a newer one can't
  // clobber the panel with stale results.
  const rankSeqRef = useRef(0);
  const [
    availableCandidates,
    setAvailableCandidates,
    ,
    clearStoredAvailableCandidates,
  ] = usePersistedState<Candidate[]>("session:availableCandidates", []);

  // Pretty user-facing label for the seat ("ward" / "electorate").
  const seatLabel = electionConfig.seatLabel;

  const { isLoading, sendMessage, clearChat, followupQuestion } = useChat();

  // `userResponses` is derived from the locked steps — it is what the LLM and
  // the right panel consume, so the transcript stays the single source of truth.
  const userResponses = useMemo<UserResponse[]>(
    () =>
      steps.filter((s) => s.response).map((s) => s.response as UserResponse),
    [steps],
  );

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch seats (electorates / wards) on mount.
  useEffect(() => {
    const fetchSeats = async () => {
      try {
        const result = await getSeatsForCurrentElection();
        if (result.success && result.data) setSeats(result.data);
      } catch (error) {
        console.error("Error fetching seats:", error);
      } finally {
        setIsLoadingSeats(false);
      }
    };
    fetchSeats();
  }, []);

  // Build the initial ward-selection step.
  const buildWardStep = useCallback(
    (): TranscriptStep => ({
      id: `step_${Date.now()}`,
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
          questionId: "ward_selection",
        },
      },
    }),
    [seats],
  );

  // Seed the transcript with the ward step once persisted state has hydrated.
  useEffect(() => {
    if (
      isStepsHydrated &&
      steps.length === 0 &&
      !isLoadingSeats &&
      seats.length > 0
    ) {
      setSteps([buildWardStep()]);
    }
  }, [
    isStepsHydrated,
    steps.length,
    isLoadingSeats,
    seats,
    buildWardStep,
    setSteps,
  ]);

  // Fire the (slow, RAG-backed) candidate ranking without blocking the chat
  // turn. The next question is already on screen; the panel + confidence update
  // when this resolves. Stale results are dropped via rankSeqRef.
  const runRanking = useCallback(
    (history: UserResponse[], candidates: Candidate[]) => {
      if (candidates.length === 0 || history.length === 0) return;
      const seq = ++rankSeqRef.current;
      rankCandidatesForSession(history, candidates)
        .then((ranking) => {
          if (seq !== rankSeqRef.current) return; // a newer ranking superseded us
          setConfidence(ranking.confidence);
          setShowCandidates(ranking.shouldShowCandidates);
          if (ranking.candidateMatches.length > 0) {
            setCandidates(ranking.candidateMatches);
          }
        })
        .catch((error) => {
          console.error("[ui:ranking] failed", serializeError(error));
        });
    },
    [setConfidence, setShowCandidates, setCandidates],
  );

  const handleComponentResponse = async (
    response: unknown,
    raw?: RawAnswer,
  ) => {
    const traceId = newTraceId("ui:componentResponse");
    const start = Date.now();
    let phase = "start";
    console.log(`[${traceId}] component response start`, {
      responsePreview:
        typeof response === "string" ? response.slice(0, 200) : response,
      raw,
      steps: steps.length,
      availableCandidates: availableCandidates.length,
    });

    const fallbackChat: ComponentData = {
      type: "chat",
      data: {
        prompt: "Please tell me what is important to you.",
        placeholder: "Share some of your views…",
      },
    };

    const appendActive = (component: ComponentData) =>
      setSteps((prev) => [
        ...prev,
        { id: `step_${Date.now()}`, component, locked: false },
      ]);

    try {
      const active = steps[steps.length - 1];
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

      const userResponse: UserResponse = {
        id: active.id,
        questionId: rawQuestionId ?? `question_${Date.now()}`,
        componentType: comp.type,
        value: formatted,
        timestamp: new Date(),
        confidence: 80,
        question: extractQuestionText(comp),
        componentData: comp,
      };

      // Lock the active step; compute the derived history synchronously.
      const lockedSteps = steps.map((s, i) =>
        i === steps.length - 1
          ? { ...s, locked: true, answer: raw, response: userResponse }
          : s,
      );
      setSteps(lockedSteps);
      setIsCompiling(true);

      const history = lockedSteps
        .filter((s) => s.response)
        .map((s) => s.response as UserResponse);

      if (
        comp.type === "dropdown" &&
        comp.data.questionId === "ward_selection"
      ) {
        const wardName =
          raw?.kind === "dropdown" ? raw.label : String(response);

        phase = "load-mayor-candidates";
        console.log(`[${traceId}] ${phase}`, { wardName });
        const mayorResult = await getMayorCandidates();
        console.log(`[${traceId}] ${phase}:done`, {
          success: mayorResult.success,
          count: mayorResult.data?.length ?? 0,
          error: mayorResult.error,
        });
        const mayorCandidates = mayorResult.success
          ? mayorResult.data || []
          : [];

        phase = "load-ward-candidates";
        console.log(`[${traceId}] ${phase}`, { wardName });
        const wardResult = await getCandidatesByWard(wardName);
        console.log(`[${traceId}] ${phase}:done`, {
          success: wardResult.success,
          count: wardResult.data?.length ?? 0,
          error: wardResult.error,
        });
        const wardCandidates = wardResult.success ? wardResult.data || [] : [];

        const allCandidates = [...mayorCandidates, ...wardCandidates];
        setAvailableCandidates(allCandidates);

        // Phase 1 (spec 009): surface the electorate's candidates in the
        // right panel immediately, before any ranking exists. Shown as
        // unranked (neutral score) until later phases compute real matches.
        setCandidates(toUnrankedMatches(allCandidates));

        const candidateNames = allCandidates.map((c) => c.name);
        const conversationState = `I am voting in the ${wardName} ${seatLabel}, and the following candidates are running: \n${candidateNames.join(
          "\n",
        )}\n\nI have not stated any opinion yet. I want you to help me figure out which of these candidates I should vote for.`;

        phase = "select-next-component";
        console.log(`[${traceId}] ${phase}`, {
          allCandidates: allCandidates.length,
          seats: seats.length,
        });
        const componentResult = await selectNextComponent(
          conversationState,
          seats,
        );
        console.log(`[${traceId}] ${phase}:done`, {
          success: componentResult.success,
          validationFailed: componentResult.validationFailed,
          componentType: componentResult.data?.type,
          error: componentResult.error,
        });
        if (componentResult.success && componentResult.data) {
          appendActive(componentResult.data);
        } else {
          console.warn(
            "Component selection failed; using fallback chat. Error:",
            componentResult.error,
          );
          appendActive(fallbackChat);
        }
      } else {
        phase = "send-chat-message";
        console.log(`[${traceId}] ${phase}`, {
          history: history.length,
          availableCandidates: availableCandidates.length,
        });
        const aiResponse = await sendMessage(
          typeof formatted === "string" ? formatted : JSON.stringify(formatted),
          history,
          availableCandidates,
        );
        console.log(`[${traceId}] ${phase}:done`, {
          hasResponse: !!aiResponse,
        });

        // Render the next question immediately — do NOT wait for ranking.
        appendActive(aiResponse?.nextComponent ?? fallbackChat);

        // Kick off candidate ranking in the background; the panel + confidence
        // update when it resolves (see runRanking). This keeps the per-turn
        // request short instead of blocking on the slow RAG ranking.
        runRanking(history, availableCandidates);
      }
    } catch (error) {
      console.error(`[${traceId}] component response failed`, {
        phase,
        elapsedMs: Date.now() - start,
        error: serializeError(error),
      });
      appendActive(fallbackChat);
    } finally {
      console.log(`[${traceId}] component response finished`, {
        phase,
        elapsedMs: Date.now() - start,
      });
      setIsCompiling(false);
    }
  };

  const handleCandidateSelect = (candidate: CandidateMatch) => {
    console.log("Selected candidate:", candidate);
  };

  const handleReset = () => {
    clearChat();
    clearStoredSteps();
    clearStoredCandidates();
    clearStoredConfidence();
    clearStoredShowCandidates();
    clearStoredAvailableCandidates();
    setIsCompiling(false);

    if (seats.length > 0) {
      setSteps([buildWardStep()]);
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
                Discover candidates that match your values
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
                <CardTitle className="flex items-center justify-between">
                  <Badge variant="outline">
                    {userResponses.length} responses
                  </Badge>
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
            <p>
              AI Voting Advisor - Anonymous and secure political preference
              matching
            </p>
            <p className="mt-1">
              No personal data collected • Open source and transparent
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
