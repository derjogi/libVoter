'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MultiSelectData, SelectOption } from '@/types';

interface MultiSelectChecklistProps {
  data: MultiSelectData;
  onResponse: (selectedAnswers: string) => void;
  disabled?: boolean;
}

export function MultiSelectChecklist({ data, onResponse, disabled = false }: MultiSelectChecklistProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleOptionToggle = (optionId: string, checked: boolean) => {
    let newSelected: string[];

    if (checked) {
      if (data.maxSelections && selectedIds.length >= data.maxSelections) {
        return; // Don't allow more selections than max
      }
      newSelected = [...selectedIds, optionId];
    } else {
      newSelected = selectedIds.filter(id => id !== optionId);
    }

    setSelectedIds(newSelected);
  };

  const handleSubmit = () => {
    if (selectedIds.length > 0) {
      const selectedLabels = selectedIds
        .map((id) => data.options.find((opt) => opt.id === id)?.label)
        .filter((label) => label !== undefined);
      onResponse(`${selectedLabels.join('\n')}`);
    }
  };

  const selectedCount = selectedIds.length;
  const maxSelections = data.maxSelections;

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">{data.question}</CardTitle>
        {maxSelections && (
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {selectedCount}/{maxSelections} selected
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {data.options.map((option) => (
            <div key={option.id} className="flex items-start space-x-3">
              <Checkbox
                id={option.id}
                checked={selectedIds.includes(option.id)}
                onCheckedChange={(checked) =>
                  handleOptionToggle(option.id, checked as boolean)
                }
                disabled={
                  disabled ||
                  (maxSelections !== undefined &&
                   !selectedIds.includes(option.id) &&
                   selectedIds.length >= maxSelections)
                }
                className="mt-1"
              />
              <div className="flex-1">
                <label
                  htmlFor={option.id}
                  className="text-sm font-medium cursor-pointer"
                >
                  {option.label}
                </label>
                {option.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={disabled || selectedIds.length === 0}
          className="w-full"
        >
          Continue ({selectedIds.length} selected)
        </Button>
      </CardContent>
    </Card>
  );
}