'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThumbsUp, ThumbsDown, SkipForward } from 'lucide-react';
import type { YesNoData } from '@/types';

interface YesNoQuestionProps {
  data: YesNoData;
  onResponse: (index: number, response: 'agree' | 'disagree' | 'skip') => void;
  disabled?: boolean;
}

export function YesNoQuestion({ data, onResponse, disabled = false }: YesNoQuestionProps) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 max-h-96 overflow-y-auto">
      {data.statements.map((item, index) => (
        <Card key={index} className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">Statement {index + 1}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-base leading-relaxed">{item.statement}</p>
              {item.context && (
                <p className="text-sm text-muted-foreground mt-2">{item.context}</p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => onResponse(index, 'agree')}
                disabled={disabled}
                className="flex-1 h-12"
                variant="default"
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                Agree
              </Button>

              <Button
                onClick={() => onResponse(index, 'disagree')}
                disabled={disabled}
                className="flex-1 h-12"
                variant="outline"
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Disagree
              </Button>
            </div>

            <Button
              onClick={() => onResponse(index, 'skip')}
              disabled={disabled}
              variant="ghost"
              className="w-full"
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Skip for now
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}