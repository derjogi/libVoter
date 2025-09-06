import type { ComponentType, ComponentSpecificData } from './index';

export interface DynamicComponentProps {
  componentData: ComponentSpecificData;
  onResponse: (response: any) => void;
  onNext?: () => void;
  disabled?: boolean;
}

export interface ComponentRendererProps {
  type: ComponentType;
  data: ComponentSpecificData;
  onResponse: (response: any) => void;
  onNext?: () => void;
  disabled?: boolean;
}