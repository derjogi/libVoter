'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DropdownData } from '@/types';

interface DropdownSelectProps {
  data: DropdownData;
  onResponse: (selectedLabel: string) => void;
  disabled?: boolean;
}

export function DropdownSelect({ data, onResponse, disabled = false }: DropdownSelectProps) {
  const [selectedId, setSelectedId] = useState<string>('');

  const handleValueChange = (value: string) => {
    setSelectedId(value);
  };

  const handleSubmit = () => {
    if (selectedId) {
      const selectedOption = data.options.find(option => option.id === selectedId);
      if (selectedOption) {
        onResponse(`Question: ${data.question}\nAnswer: ${selectedOption.label}`);
      }
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto h-full flex flex-col min-h-0">
      <CardHeader>
        <CardTitle className="text-lg">{data.question}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-4">
        <Select value={selectedId} onValueChange={handleValueChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder={data.placeholder || "Select an option..."} />
          </SelectTrigger>
          <SelectContent>
            {data.options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="text-sm text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleSubmit}
          disabled={disabled || !selectedId}
          className="w-full mt-auto"
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}