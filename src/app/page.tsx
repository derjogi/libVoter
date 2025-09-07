'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComponentRenderer } from '@/components/dynamic/ComponentRenderer';
import { RightPanel } from '@/components/layout/RightPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useChat } from '@/lib/client/hooks/useChat';
import type { ConversationMessage, UserResponse, ComponentData, CandidateMatch } from '@/types';

export default function VotingAdvisor() {
  const [currentComponent, setCurrentComponent] = useState<ComponentData | null>(null);
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  const { messages, isLoading, sendMessage, clearChat } = useChat();

  // Check if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize with chat component
  useEffect(() => {
    if (!currentComponent) {
      setCurrentComponent({
        type: 'chat',
        data: {
          messages: messages,
          placeholder: 'Tell me about your political preferences...'
        }
      });
    }
  }, [currentComponent]);

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
      // Create user response record
      const userResponse: UserResponse = {
        id: `response_${Date.now()}`,
        questionId: `question_${Date.now()}`,
        componentType: currentComponent?.type || 'chat',
        value: response,
        timestamp: new Date(),
        confidence: 80 // User confidence rating
      };

      setUserResponses(prev => [...prev, userResponse]);

      // Send message to AI and get response
      const aiResponse = await sendMessage(
        typeof response === 'string' ? response : JSON.stringify(response),
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
    setCurrentComponent({
      type: 'chat',
      data: {
        messages: [],
        placeholder: 'Tell me about your political preferences...'
      }
    });
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
                  <span>Your Preferences</span>
                  <Badge variant="outline">
                    {userResponses.length} responses
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentComponent && (
                  <ComponentRenderer
                    type={currentComponent.type}
                    data={currentComponent.data}
                    onResponse={handleComponentResponse}
                    disabled={isLoading}
                    isLoading={isLoading}
                  />
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