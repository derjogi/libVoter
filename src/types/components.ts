import type { ComponentData } from "./components.zod";
import type { RawAnswer } from "./index";

export interface DynamicComponentProps {
  componentData: ComponentData;
  onResponse: (response: any) => void;
  onNext?: () => void;
  disabled?: boolean;
}

/**
 * Renderer props. `componentData` is the discriminated union from
 * `components.zod.ts`, so the switch in `ComponentRenderer` narrows the
 * payload automatically — no `as any` casts needed.
 *
 * `onResponse` receives the formatted answer string (consumed by the LLM) plus
 * the raw, per-type selection so the transcript can redraw a locked widget.
 * When `locked` is true the widget renders non-interactive and greyed; `value`
 * supplies the raw answer to display in that state.
 */
export interface ComponentRendererProps {
  componentData: ComponentData;
  onResponse: (response: any, raw?: RawAnswer) => void;
  onNext?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  locked?: boolean;
  value?: RawAnswer;
  followupQuestion?: {
    question: string;
    type: string;
    reasoning?: string;
  };
}
