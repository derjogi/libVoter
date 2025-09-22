'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send } from 'lucide-react';
import type { FreeTextData } from '@/types';

interface FreeTextInputProps {
  data: FreeTextData;
  onResponse: (text: string) => void;
  disabled?: boolean;
}

export function FreeTextInput({ data, onResponse, disabled = false }: FreeTextInputProps) {
  const [text, setText] = useState('');
  const characterCount = text.length;
  const maxLength = data.maxLength || 1000;

  const handleSubmit = () => {
    if (text.trim()) {
      const formattedResponse = `Prompt: ${data.prompt}\nResponse: ${text.trim()}`;
      onResponse(formattedResponse);
      setText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">{data.prompt}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={data.placeholder}
            disabled={disabled}
            maxLength={maxLength}
            rows={6}
            className="resize-none"
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Share your detailed thoughts</span>
            <span>{characterCount}/{maxLength}</span>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="w-full"
        >
          <Send className="mr-2 h-4 w-4" />
          Submit Response
        </Button>
      </CardContent>
    </Card>
  );
}