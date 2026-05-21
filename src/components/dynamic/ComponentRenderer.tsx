"use client";

import type { ComponentRendererProps } from "@/types/components";
import { ChatInterface } from "./ChatInterface";
import { DropdownSelect } from "./DropdownSelect";
import { FreeTextInput } from "./FreeTextInput";
import { MultiSelectChecklist } from "./MultiSelectChecklist";
import { QuantitativeSlider } from "./QuantitativeSlider";
import { YesNoQuestion } from "./YesNoQuestion";

/**
 * Picks the right dynamic component for `componentData.type`. The discriminated
 * union from `components.zod.ts` means each `case` narrows `componentData.data`
 * to the right shape automatically — no casting needed.
 */
export function ComponentRenderer({
  componentData,
  onResponse,
  disabled = false,
  isLoading = false,
  followupQuestion,
}: ComponentRendererProps) {
  switch (componentData.type) {
    case "chat":
      return (
        <ChatInterface
          data={componentData.data}
          onSendMessage={onResponse}
          messages={componentData.data.messages ?? []}
          isLoading={isLoading}
          disabled={disabled}
          followupQuestion={followupQuestion}
        />
      );

    case "yesno":
      return (
        <YesNoQuestion
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case "multiselect":
      return (
        <MultiSelectChecklist
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case "dropdown":
      return (
        <DropdownSelect
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case "freetext":
      return (
        <FreeTextInput
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case "slider":
      return (
        <QuantitativeSlider
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    default: {
      // Exhaustiveness check — if a new component type is added to the
      // discriminated union, TypeScript will fail here until the switch is
      // updated.
      const _exhaustive: never = componentData;
      return (
        <div className="text-center p-8">
          <p className="text-muted-foreground">
            Unknown component type: {JSON.stringify(_exhaustive)}
          </p>
        </div>
      );
    }
  }
}
