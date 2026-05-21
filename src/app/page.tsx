"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ComponentRenderer } from "@/components/dynamic/ComponentRenderer";
import { RightPanel } from "@/components/layout/RightPanel";
import { useChat } from "@/lib/client/hooks/useChat";
import { selectNextComponent } from "@/lib/actions/prompts";
import {
  getCandidatesByWard,
  getSeatsForCurrentElection,
  getMayorCandidates,
} from "@/lib/actions/database";
import { electionConfig } from "@/lib/config/election";
import type { UserResponse, ComponentData, CandidateMatch } from "@/types";
import type { Candidate } from "@/lib/db/schema";

export default function VotingAdvisor() {
  const [currentComponent, setCurrentComponent] =
    useState<ComponentData | null>(null);
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [preferenceSummary, setPreferenceSummary] =
    useState<string>("Your Preferences");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [seats, setSeats] = useState<string[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [availableCandidates, setAvailableCandidates] = useState<Candidate[]>(
    [],
  );

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

  // Initialize with seat selection component
  useEffect(() => {
    if (!currentComponent && !isLoadingSeats && seats.length > 0) {
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
  }, [currentComponent, isLoadingSeats, seats, seatLabel]);

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
  }, [messages]);

  const handleComponentResponse = async (response: any) => {
    try {
      console.log(`Got response for ${currentComponent?.type}:\n`, response);

      if (
        currentComponent?.type === "dropdown" &&
        currentComponent.data.questionId === "ward_selection"
      ) {
        // Fetch mayor candidates
        const mayorResult = await getMayorCandidates();
        const mayorCandidates = mayorResult.success
          ? mayorResult.data || []
          : [];

        // Fetch ward candidates
        const wardResult = await getCandidatesByWard(response);
        const wardCandidates = wardResult.success ? wardResult.data || [] : [];

        // Combine and store available candidates
        const allCandidates = [...mayorCandidates, ...wardCandidates];
        setAvailableCandidates(allCandidates);

        const candidateNames = allCandidates.map((c) => c.name);
        const conversationState = `I am voting in the ${response} ${seatLabel}, and the following candidates are running: \n${candidateNames?.join(
          "\n",
        )}\n\nI have not stated any opinion yet. I want you to help me figure out which of these candidates I should vote for.`;

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
        // We don't need any additional AI questions after the initial ward selection.
        return;
      }

      // Handle different response formats based on component type
      let processedResponse = response;
      let questionId = `question_${Date.now()}`;

      // if (currentComponent?.type === 'yesno' && typeof response === 'object' && 'index' in response) {
      //   // For yesno components, include the statement index in the question ID
      //   questionId = `yesno_statement_${response.index}_${Date.now()}`;
      //   processedResponse = response.response; // Extract the actual response ('agree' | 'disagree' | 'skip')
      // }

      // Create user response record
      const userResponse: UserResponse = {
        id: `response_${Date.now()}`,
        questionId,
        componentType: currentComponent?.type || "chat",
        value: processedResponse,
        timestamp: new Date(),
        confidence: 80, // User confidence rating
      };

      setUserResponses((prev) => [...prev, userResponse]);

      // Send message to AI and get response
      const aiResponse = await sendMessage(
        typeof processedResponse === "string"
          ? processedResponse
          : JSON.stringify(processedResponse),
        userResponses,
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
    setUserResponses([]);
    setCandidates([]);
    setConfidence(0);
    setShowCandidates(false);
  };

  const handleUndo = () => {
    // Remove last response and message
    setUserResponses((prev) => prev.slice(0, -1));
    // Note: In a real implementation, you'd also remove the last AI message
  };

  return (
    <div className="min-h-screen bg-background">
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
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-15rem)]">
          {/* Left Side - Dynamic Input */}
          <div className={`${isMobile && showCandidates ? "hidden" : "block"}`}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <Badge variant="outline">
                    {userResponses.length} responses
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingSeats ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">
                      Loading {electionConfig.seatLabelPlural}...
                    </p>
                  </div>
                ) : currentComponent ? (
                  <ComponentRenderer
                    componentData={currentComponent}
                    onResponse={handleComponentResponse}
                    disabled={isLoading}
                    isLoading={isLoading}
                    // followupQuestion={followupQuestion}
                  />
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Candidate Matches (always visible per spec 005) */}
          <div
            className={`${isMobile && !showCandidates ? "hidden" : "block"}`}
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
