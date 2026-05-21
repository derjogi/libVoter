import type { ComponentData } from "./components.zod";

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
 */
export interface ComponentRendererProps {
  componentData: ComponentData;
  onResponse: (response: any) => void;
  onNext?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  followupQuestion?: {
    question: string;
    type: string;
    reasoning?: string;
  };
}
