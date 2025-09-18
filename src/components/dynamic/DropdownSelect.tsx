'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DropdownData } from '@/types';

interface DropdownSelectProps {
  data: DropdownData;
  onResponse: (selectedId: string) => void;
  disabled?: boolean;
}

export function DropdownSelect({ data, onResponse, disabled = false }: DropdownSelectProps) {
  const [selectedId, setSelectedId] = useState<string>('');

  const handleValueChange = (value: string) => {
    setSelectedId(value);
  };

  const handleSubmit = () => {
    if (selectedId) {
      onResponse(selectedId);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">{data.question}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          className="w-full"
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}