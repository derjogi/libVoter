'use client';

import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { SliderData } from '@/types';

interface QuantitativeSliderProps {
  data: SliderData;
  onResponse: (value: string) => void;
  disabled?: boolean;
}

export function QuantitativeSlider({ data, onResponse, disabled = false }: QuantitativeSliderProps) {
  const [value, setValue] = useState<number>((data.min + data.max) / 2);

  const handleSubmit = () => {
    const descriptiveString = `Question: ${data.label}\nAnswer: ${value}${data.unit ? ' ' + data.unit : ''}${data.description ? ' (' + data.description + ')' : ''}`;
    onResponse(descriptiveString);
  };

  const percentage = Math.round(((value - data.min) / (data.max - data.min)) * 100);

  return (
    <Card className="w-full max-w-lg mx-auto h-full flex flex-col min-h-0">
      <CardHeader>
        <CardTitle className="text-lg">{data.label}</CardTitle>
        {data.description && (
          <p className="text-sm text-muted-foreground">{data.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-6">
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{value}</div>
            {data.unit && <div className="text-sm text-muted-foreground">{data.unit}</div>}
            <div className="text-sm text-muted-foreground mt-1">
              {percentage}% of maximum
            </div>
          </div>

          <Slider
            value={[value]}
            onValueChange={(values) => setValue(values[0])}
            min={data.min}
            max={data.max}
            step={data.step || 1}
            disabled={disabled}
            className="w-full"
          />

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{data.min}{data.unit && ` ${data.unit}`}</span>
            <span>{data.max}{data.unit && ` ${data.unit}`}</span>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full mt-auto"
        >
          Confirm Selection
        </Button>
      </CardContent>
    </Card>
  );
}