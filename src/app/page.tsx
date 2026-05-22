"use client";

import { useEffect, useRef, useState } from "react";
import { ComponentRenderer } from "@/components/dynamic/ComponentRenderer";
import {
  ChatHistory,
  extractQuestionText,
} from "@/components/dynamic/ChatHistory";
import { RightPanel } from "@/components/layout/RightPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCandidatesByWard,
  getMayorCandidates,
  getSeatsForCurrentElection,
} from "@/lib/actions/database";
import { selectNextComponent } from "@/lib/actions/prompts";
import { useChat } from "@/lib/client/hooks/useChat";
import { usePersistedState } from "@/lib/client/hooks/usePersistedState";
import { electionConfig } from "@/lib/config/election";
import type { Candidate } from "@/lib/db/schema";
import type { CandidateMatch, ComponentData, UserResponse } from "@/types";

export default function VotingAdvisor() {
  const [
    currentComponent,
    setCurrentComponent,
    isComponentHydrated,
    clearStoredComponent,
  ] = usePersistedState<ComponentData | null>("session:currentComponent", null);
  const [userResponses, setUserResponses, , clearStoredResponses] =
    usePersistedState<UserResponse[]>("session:userResponses", []);
  const [candidates, setCandidates, , clearStoredCandidates] =
    usePersistedState<CandidateMatch[]>("session:candidates", []);
  const [confidence, setConfidence, , clearStoredConfidence] =
    usePersistedState<number>("session:confidence", 0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCandidates, setShowCandidates, , clearStoredShowCandidates] =
    usePersistedState<boolean>("session:showCandidates", false);
  const [preferenceSummary, setPreferenceSummary] =
    useState<string>("Your Preferences");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [seats, setSeats] = useState<string[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [
    availableCandidates,
    setAvailableCandidates,
    ,
    clearStoredAvailableCandidates,
  ] = usePersistedState<Candidate[]>("session:availableCandidates", []);
  // Ref always reflects the latest userResponses (avoids stale closure in sendMessage).
  const userResponsesRef = useRef<UserResponse[]>(userResponses);
  useEffect(() => {
    userResponsesRef.current = userResponses;
  }, [userResponses]);

  // Pretty user-facing label for the seat ("ward" / "electorate") from the
  // current election config.
  const seatLabel = electionConfig.seatLabel;

  const { messages, isLoading, sendMessage, clearChat, followupQuestion } =
    useChat();

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch seats (electorates / wards) on component mount
  useEffect(() => {
    const fetchSeats = async () => {
      try {
        const result = await getSeatsForCurrentElection();
        if (result.success && result.data) {
          setSeats(result.data);
        }
      } catch (error) {
        console.error("Error fetching seats:", error);
      } finally {
        setIsLoadingSeats(false);
      }
    };

    fetchSeats();
  }, []);

  // Initialize with seat selection component. Wait until the persisted
  // session state has been read from localStorage; otherwise we'd briefly
  // overwrite a restored `currentComponent` with the ward dropdown.
  useEffect(() => {
    if (
      isComponentHydrated &&
      !currentComponent &&
      !isLoadingSeats &&
      seats.length > 0
    ) {
      const options = seats.map((seat) => ({
        id: seat,
        label: seat,
        description: "",
      }));
      setCurrentComponent({
        type: "dropdown",
        data: {
          question: `Which ${seatLabel} do you live in?`,
          options,
          placeholder: `Select your ${seatLabel}...`,
          questionId: "ward_selection",
        },
      });
    }
  }, [
    isComponentHydrated,
    currentComponent,
    isLoadingSeats,
    seats,
    seatLabel,
    setCurrentComponent,
  ]);

  // Update messages in currentComponent when messages change
  useEffect(() => {
    if (currentComponent?.type === "chat") {
      setCurrentComponent((prev) => {
        if (!prev || prev.type !== "chat") return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            messages,
          },
        };
      });
    }
  }, [messages, currentComponent?.type, setCurrentComponent]);

  const handleComponentResponse = async (response: unknown) => {
    try {
      console.log(`Got response for ${currentComponent?.type}:\n`, response);

      if (
        currentComponent?.type === "dropdown" &&
        currentComponent.data.questionId === "ward_selection"
      ) {
        const responseString =
          typeof response === "string" ? response : String(response);
        // Fetch mayor candidates
        const mayorResult = await getMayorCandidates();
        const mayorCandidates = mayorResult.success
          ? mayorResult.data || []
          : [];

        // Fetch ward candidates
        const wardResult = await getCandidatesByWard(responseString);
        const wardCandidates = wardResult.success ? wardResult.data || [] : [];

        // Combine and store available candidates
        const allCandidates = [...mayorCandidates, ...wardCandidates];
        setAvailableCandidates(allCandidates);

        const candidateNames = allCandidates.map((c) => c.name);
        const conversationState = `I am voting in the ${responseString} ${seatLabel}, and the following candidates are running: \n${candidateNames?.join(
          "\n",
        )}\n\nI have not stated any opinion yet. I want you to help me figure out which of these candidates I should vote for.`;

        // Append the ward-selection step to userResponses so ChatHistory shows it
        // and the LLM receives it in the next turn.
        const wardUserResponse: UserResponse = {
          id: `response_${Date.now()}`,
          questionId: currentComponent.data.questionId ?? "ward_selection",
          componentType: "dropdown",
          value: responseString,
          timestamp: new Date(),
          confidence: 80,
          question:
            currentComponent.data.question ??
            extractQuestionText(currentComponent),
          componentData: currentComponent,
        };
        setUserResponses((prev) => [...prev, wardUserResponse]);

        const componentResult = await selectNextComponent(conversationState);

        if (componentResult.success && componentResult.data) {
          console.log("Component selection result:", componentResult.data);
          // componentResult.data is already a validated ComponentData.
          setCurrentComponent(componentResult.data);
        } else {
          console.warn(
            "Component selection failed; using fallback chat. Error:",
            componentResult.error,
          );
          setCurrentComponent({
            type: "chat",
            data: {
              prompt: "Please tell me what is important to you.",
              placeholder: "Hey, please let me know some of your views.",
            },
          });
        }
        // Ward step is handled — do not fall through to the general response
        // processing path below (which Normalises response values and calls
        // sendMessage).  The next turn starts fresh with the LLM-powered next
        // question that selectNextComponent already set.
      } else {
        // Handle different response formats based on component type
        const processedResponse: UserResponse["value"] =
          typeof response === "string"
            ? response
            : typeof response === "number" || typeof response === "boolean"
              ? response
              : Array.isArray(response)
                ? response
                : typeof response === "object" && response !== null
                  ? JSON.stringify(response)
                  : String(response);
        const questionId = `question_${Date.now()}`;

        // Store the question text and full component data snapshot before
        // the dialog in the currentComponent.discriminated step panel
        // can reconstruct each Q&A step without guessing.
        const activeComp = currentComponent; // narrow from ComponentData | null
        const compDisplayQ = extractQuestionText(activeComp ?? undefined);
        // questionId is only present on dropdown/multiselect data; guard with type check.
        const rawQuestionId = (
          activeComp as { data?: { questionId?: string } } | null
        )?.data?.questionId;
        const compDisplayQId = rawQuestionId ?? questionId;

        const userResponse: UserResponse = {
          id: `response_${Date.now()}`,
          questionId: compDisplayQId,
          componentType: activeComp?.type || "chat",
          value: processedResponse,
          timestamp: new Date(),
          confidence: 80, // User confidence rating
          question: compDisplayQ,
          componentData: activeComp ?? undefined,
        };

        setUserResponses((prev) => {
          userResponsesRef.current = [...prev, userResponse];
          return userResponsesRef.current;
        });

        // Send message to AI and get response — always pass the latest history
        // (userResponsesRef is updated synchronously in the setter above).
        const aiResponse = await sendMessage(
          typeof processedResponse === "string"
            ? processedResponse
            : JSON.stringify(processedResponse),
          userResponsesRef.current,
          availableCandidates,
        );

        if (aiResponse) {
          setConfidence(aiResponse.confidence);
          setShowCandidates(aiResponse.shouldShowCandidates);

          // Update candidates if available
          if (aiResponse.candidateMatches) {
            setCandidates(aiResponse.candidateMatches);
          }

          // Update component if AI suggests a new one
          if (aiResponse.nextComponent) {
            setCurrentComponent(aiResponse.nextComponent);
          }
        }
      } // end else — general (non-ward) response path
    } catch (error) {
      console.error("Error processing response:", error);
    }
  };

  const handleCandidateSelect = (candidate: CandidateMatch) => {
    console.log("Selected candidate:", candidate);
    // Handle candidate selection - could navigate to detailed view
  };

  const handleReset = () => {
    clearChat();
    // Wipe persisted session state so a subsequent reload starts fresh.
    clearStoredComponent();
    clearStoredResponses();
    clearStoredCandidates();
    clearStoredConfidence();
    clearStoredShowCandidates();
    clearStoredAvailableCandidates();

    if (seats.length > 0) {
      const options = seats.map((seat) => ({
        id: seat,
        label: seat,
        description: "",
      }));
      setCurrentComponent({
        type: "dropdown",
        data: {
          question: `Which ${seatLabel} do you live in?`,
          options,
          placeholder: `Select your ${seatLabel}...`,
          questionId: "ward_selection",
        },
      });
    } else {
      // Fallback to chat if seats not loaded
      setCurrentComponent({
        type: "chat",
        data: {
          messages: [],
          placeholder: "Tell me about your political preferences...",
        },
      });
    }
  };

  const handleUndo = () => {
    // Remove last response and message
    setUserResponses((prev) => prev.slice(0, -1));
    // Note: In a real implementation, you'd also remove the last AI message
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
          {/* Left Side - Dynamic Input */}
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
              <CardContent className="space-y-4 flex-1 min-h-0 flex flex-col">
                {isLoadingSeats ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">
                      Loading {electionConfig.seatLabelPlural}...
                    </p>
                  </div>
                ) : currentComponent ? (
                  <>
                    {/* Collapsible history of all completed Q&A steps */}
                    {userResponses.length > 0 && (
                      <ChatHistory steps={userResponses} />
                    )}

                    {/* Current active question */}
                    <div className="flex-1 min-h-0" data-testid="active-step">
                      <ComponentRenderer
                        componentData={currentComponent}
                        onResponse={handleComponentResponse}
                        disabled={isLoading}
                        isLoading={isLoading}
                      />
                    </div>
                  </>
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
              onReadyToDecide={() => {
                // User has chosen to stop. Collapse the question panel by
                // surfacing the right panel on mobile.
                setShowCandidates(true);
              }}
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
