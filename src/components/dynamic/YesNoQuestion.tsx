'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThumbsUp, ThumbsDown, SkipForward } from 'lucide-react';
import type { YesNoData } from '@/types';

interface YesNoQuestionProps {
  data: YesNoData;
  onResponse: (response: 'agree' | 'disagree' | 'skip') => void;
  disabled?: boolean;
}

export function YesNoQuestion({ data, onResponse, disabled = false }: YesNoQuestionProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">Statement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <p className="text-base leading-relaxed">{data.statement}</p>
          {data.context && (
            <p className="text-sm text-muted-foreground mt-2">{data.context}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => onResponse('agree')}
            disabled={disabled}
            className="flex-1 h-12"
            variant="default"
          >
            <ThumbsUp className="mr-2 h-4 w-4" />
            Agree
          </Button>

          <Button
            onClick={() => onResponse('disagree')}
            disabled={disabled}
            className="flex-1 h-12"
            variant="outline"
          >
            <ThumbsDown className="mr-2 h-4 w-4" />
            Disagree
          </Button>
        </div>

        <Button
          onClick={() => onResponse('skip')}
          disabled={disabled}
          variant="ghost"
          className="w-full"
        >
          <SkipForward className="mr-2 h-4 w-4" />
          Skip for now
        </Button>
      </CardContent>
    </Card>
  );
}