"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { RawAnswer, SliderData } from "@/types";

interface QuantitativeSliderProps {
  data: SliderData;
  onResponse: (value: string, raw?: RawAnswer) => void;
  disabled?: boolean;
  locked?: boolean;
  value?: RawAnswer;
}

export function QuantitativeSlider({
  data,
  onResponse,
  disabled = false,
  locked = false,
  value,
}: QuantitativeSliderProps) {
  const initialValue =
    value?.kind === "slider" ? value.value : (data.min + data.max) / 2;
  const [sliderValue, setSliderValue] = useState<number>(initialValue);

  const handleSubmit = () => {
    const descriptiveString = `Question: ${data.label}\nAnswer: ${sliderValue}${data.unit ? ` ${data.unit}` : ""}${data.description ? ` (${data.description})` : ""}`;
    onResponse(descriptiveString, { kind: "slider", value: sliderValue });
  };

  const percentage = Math.round(
    ((sliderValue - data.min) / (data.max - data.min)) * 100,
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">{data.label}</h3>
        {data.description && (
          <p className="text-sm text-muted-foreground">{data.description}</p>
        )}
      </div>

      <div className="text-center">
        <div className="text-3xl font-bold text-primary">{sliderValue}</div>
        {data.unit && (
          <div className="text-sm text-muted-foreground">{data.unit}</div>
        )}
        <div className="text-sm text-muted-foreground mt-1">
          {percentage}% of maximum
        </div>
      </div>

      <Slider
        value={[sliderValue]}
        onValueChange={(values) => setSliderValue(values[0])}
        min={data.min}
        max={data.max}
        step={data.step || 1}
        disabled={disabled || locked}
        className="w-full"
      />

      <div className="flex justify-between text-sm text-muted-foreground">
        <span>
          {data.min}
          {data.unit && ` ${data.unit}`}
        </span>
        <span>
          {data.max}
          {data.unit && ` ${data.unit}`}
        </span>
      </div>

      {!locked && (
        <Button onClick={handleSubmit} disabled={disabled}>
          Confirm Selection
        </Button>
      )}
    </div>
  );
}
