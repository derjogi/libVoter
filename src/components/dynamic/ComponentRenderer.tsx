"use client";

import type { ComponentRendererProps } from "@/types/components";
import { ChatInterface } from "./ChatInterface";
import { DropdownSelect } from "./DropdownSelect";
import { FreeTextInput } from "./FreeTextInput";
import { MultiSelectChecklist } from "./MultiSelectChecklist";
import { PriorityRanking } from "./PriorityRanking";
import { QuantitativeSlider } from "./QuantitativeSlider";
import { YesNoQuestion } from "./YesNoQuestion";

/**
 * Picks the right dynamic component for `componentData.type`. The discriminated
 * union from `components.zod.ts` means each `case` narrows `componentData.data`
 * to the right shape automatically — no casting needed.
 *
 * `locked` renders the widget non-interactive (an already-answered transcript
 * step) and `value` supplies the raw answer to display in that state.
 */
export function ComponentRenderer({
  componentData,
  onResponse,
  disabled = false,
  isLoading = false,
  locked = false,
  value,
  followupQuestion,
}: ComponentRendererProps) {
  switch (componentData.type) {
    case "chat":
      return (
        <ChatInterface
          data={componentData.data}
          onSendMessage={onResponse}
          isLoading={isLoading}
          disabled={disabled}
          locked={locked}
          value={value}
          followupQuestion={followupQuestion}
        />
      );

    case "yesno":
      return (
        <YesNoQuestion
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
          locked={locked}
          value={value}
        />
      );

    case "multiselect":
      return (
        <MultiSelectChecklist
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
          locked={locked}
          value={value}
        />
      );

    case "dropdown":
      return (
        <DropdownSelect
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
          locked={locked}
          value={value}
        />
      );

    case "freetext":
      return (
        <FreeTextInput
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
          locked={locked}
          value={value}
        />
      );

    case "slider":
      return (
        <QuantitativeSlider
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
          locked={locked}
          value={value}
        />
      );

    case "priority":
      return (
        <PriorityRanking
          data={componentData.data}
          onResponse={onResponse}
          disabled={disabled}
          locked={locked}
          value={value}
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
