'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComponentRenderer } from '@/components/dynamic/ComponentRenderer';
import { RightPanel } from '@/components/layout/RightPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useChat } from '@/lib/client/hooks/useChat';
import { selectNextComponent, summarizeUserPreferences } from '@/lib/actions/prompts';
import { getCandidatesByWard, getUniqueWards } from '@/lib/actions/database';
import type { ConversationMessage, UserResponse, ComponentData, CandidateMatch, DropdownData } from '@/types';
import { getPromptManager, PromptManager } from '@/lib/server/prompts/prompt-manager';
import { date } from 'zod';

export default function VotingAdvisor() {
  const [currentComponent, setCurrentComponent] = useState<ComponentData | null>(null);
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [preferenceSummary, setPreferenceSummary] = useState<string>('Your Preferences');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [wards, setWards] = useState<string[]>([]);
  const [isLoadingWards, setIsLoadingWards] = useState(true);

  const { messages, isLoading, sendMessage, clearChat, followupQuestion } = useChat();

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch wards on component mount
  useEffect(() => {
    const fetchWards = async () => {
      try {
        const wardResult = await getUniqueWards();
        if (wardResult.success && wardResult.data) {
          setWards(wardResult.data);
        }
      } catch (error) {
        console.error('Error fetching wards:', error);
      } finally {
        setIsLoadingWards(false);
      }
    };

    fetchWards();
  }, []);

  // Initialize with ward selection component
  useEffect(() => {
    if (!currentComponent && !isLoadingWards && wards.length > 0) {
      const options = wards.map(ward => ({ id: ward, label: ward, description: '' }));
      setCurrentComponent({
        type: 'dropdown',
        data: {
          question: 'Which ward do you live in?',
          options,
          placeholder: 'Select your ward...',
          questionId: 'ward_selection'
        }
      });
    }
  }, [currentComponent, isLoadingWards, wards]);

  // Update messages in currentComponent when messages change
  useEffect(() => {
    if (currentComponent && currentComponent.type === 'chat') {
      setCurrentComponent(prev => prev ? {
        ...prev,
        data: {
          ...prev.data,
          messages: messages
        }
      } : null);
    }
  }, [messages]);

  const handleComponentResponse = async (response: any) => {
    try {
      
      if (
        currentComponent?.type === "dropdown" &&
        (currentComponent.data as DropdownData).questionId === "ward_selection"
      ) {
        const candidates = (await getCandidatesByWard(response))?.data;
        const conversationState = `I am voting in ${response}, and the following candidates are running: \n${candidates?.join(
          "\n"
        )}\n\nI have not stated any opinion yet, but I want you to help me figure out which of these candidates align best with my yet undisclosed views.`;
        
        const componentResult = await selectNextComponent(conversationState);

        if (componentResult.success && componentResult.data) {
          console.log("Component selection result:", componentResult.data);

          // Convert the result to ComponentData format
          const componentData: ComponentData = {
            type: componentResult.data.component,
            data: componentResult.data.data,
          };

          setCurrentComponent(componentData);
        } else {
          console.warn("Component selection failed; using fallback chat. Error:", componentResult.error);
          setCurrentComponent({ type: 'chat', data: {prompt: 'Please tell me what is important to you.', placeholder: 'Hey, please let me know some of your views.'}})
        }
        return;
      }
      
      
      // Handle different response formats based on component type
      let processedResponse = response;
      let questionId = `question_${Date.now()}`;

      if (currentComponent?.type === 'yesno' && typeof response === 'object' && 'index' in response) {
        // For yesno components, include the statement index in the question ID
        questionId = `yesno_statement_${response.index}_${Date.now()}`;
        processedResponse = response.response; // Extract the actual response ('agree' | 'disagree' | 'skip')
      } 

      // Create user response record
      const userResponse: UserResponse = {
        id: `response_${Date.now()}`,
        questionId,
        componentType: currentComponent?.type || 'chat',
        value: processedResponse,
        timestamp: new Date(),
        confidence: 80 // User confidence rating
      };

      setUserResponses(prev => [...prev, userResponse]);

      // Send message to AI and get response
      const aiResponse = await sendMessage(
        typeof processedResponse === 'string' ? processedResponse : JSON.stringify(processedResponse),
        userResponses
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
      console.error('Error processing response:', error);
    }
  };

  const handleCandidateSelect = (candidate: CandidateMatch) => {
    console.log('Selected candidate:', candidate);
    // Handle candidate selection - could navigate to detailed view
  };

  const handleReset = () => {
    clearChat();
    if (wards.length > 0) {
      const options = wards.map(ward => ({ id: ward, label: ward, description: '' }));
      setCurrentComponent({
        type: 'dropdown',
        data: {
          question: 'Which ward do you live in?',
          options,
          placeholder: 'Select your ward...',
          questionId: 'ward_selection'
        }
      });
    } else {
      // Fallback to chat if wards not loaded
      setCurrentComponent({
        type: 'chat',
        data: {
          messages: [],
          placeholder: 'Tell me about your political preferences...'
        }
      });
    }
    setUserResponses([]);
    setCandidates([]);
    setConfidence(0);
    setShowCandidates(false);
  };

  const handleUndo = () => {
    // Remove last response and message
    setUserResponses(prev => prev.slice(0, -1));
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
              <p className="text-muted-foreground">Discover candidates that match your values</p>
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

      {/* Progress Bar */}
      <div className="border-b bg-muted/50">
        <div className="container mx-auto px-4 py-3">
          <ProgressBar
            progress={confidence}
            onReset={handleReset}
            onUndo={userResponses.length > 0 ? handleUndo : undefined}
            showUndo={userResponses.length > 0}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
          {/* Left Side - Dynamic Input */}
          <div className={`${isMobile && showCandidates ? 'hidden' : 'block'}`}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <Badge variant="outline">
                    {userResponses.length} responses
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingWards ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading wards...</p>
                  </div>
                ) : currentComponent ? (
                  <ComponentRenderer
                    type={currentComponent.type}
                    data={currentComponent.data}
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

          {/* Right Side - Candidate Matches */}
          <div className={`${isMobile && !showCandidates ? 'hidden' : 'block'}`}>
            <RightPanel
              candidates={candidates}
              confidence={confidence}
              isVisible={showCandidates || confidence > 30}
              isMobile={isMobile}
              onCandidateSelect={handleCandidateSelect}
              userResponses={userResponses}
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
      <footer className="border-t bg-muted/50 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>AI Voting Advisor - Anonymous and secure political preference matching</p>
            <p className="mt-1">No personal data collected • Open source and transparent</p>
          </div>
        </div>
      </footer>
    </div>
  );
}