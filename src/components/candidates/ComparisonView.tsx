'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { X, Star, CheckCircle, XCircle } from 'lucide-react';
import type { CandidateMatch } from '@/types';

interface ComparisonViewProps {
  candidates: CandidateMatch[];
  onClose: () => void;
  onSelectCandidate: (candidate: CandidateMatch) => void;
}

export function ComparisonView({
  candidates,
  onClose,
  onSelectCandidate
}: ComparisonViewProps) {
  const [selectedTab, setSelectedTab] = useState('overview');

  if (candidates.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
      <div className="container mx-auto p-4 h-full flex items-center justify-center">
        <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Candidate Comparison</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="overflow-y-auto">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="policies">Policies</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {candidates.map((candidate) => (
                    <Card key={candidate.candidate.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">{candidate.candidate.name}</CardTitle>
                            <Badge variant="secondary" className="mt-1">
                              {candidate.candidate.party}
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSelectCandidate(candidate)}
                          >
                            View Details
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Match Score</span>
                              <span className="font-bold">{candidate.score}%</span>
                            </div>
                            <Progress value={candidate.score} className="h-2" />
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {candidate.reasoning}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="policies" className="space-y-4">
                <div className="grid gap-6 md:grid-cols-2">
                  {candidates.map((candidate) => (
                    <div key={candidate.candidate.id} className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold">{candidate.candidate.name}</h3>
                        <Badge variant="secondary">{candidate.candidate.party}</Badge>
                      </div>

                      <div className="space-y-2">
                        {candidate.topMatchingPolicies.map((policy, index) => (
                          <div key={index} className="flex items-center p-2 bg-muted rounded">
                            <Star className="mr-2 h-4 w-4 text-yellow-500 flex-shrink-0" />
                            <span className="text-sm">{policy}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="details" className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {candidates.map((candidate) => (
                    <div key={candidate.candidate.id} className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-lg">{candidate.candidate.name}</h3>
                        <Badge variant="secondary">{candidate.candidate.party}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-medium mb-2 flex items-center text-green-600">
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Pros
                          </h4>
                          <ul className="text-sm space-y-1">
                            {candidate.pros.slice(0, 3).map((pro, index) => (
                              <li key={index} className="flex items-start">
                                <CheckCircle className="mr-2 h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2 flex items-center text-red-600">
                            <XCircle className="mr-2 h-4 w-4" />
                            Considerations
                          </h4>
                          <ul className="text-sm space-y-1">
                            {candidate.cons.slice(0, 3).map((con, index) => (
                              <li key={index} className="flex items-start">
                                <XCircle className="mr-2 h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                                {con}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}