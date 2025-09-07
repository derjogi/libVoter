'use client';

import type { ComponentRendererProps } from '@/types/components';
import type { ChatData } from '@/types';
import { ChatInterface } from './ChatInterface';
import { YesNoQuestion } from './YesNoQuestion';
import { MultiSelectChecklist } from './MultiSelectChecklist';
import { FreeTextInput } from './FreeTextInput';
import { QuantitativeSlider } from './QuantitativeSlider';

export function ComponentRenderer({
  type,
  data,
  onResponse,
  onNext,
  disabled = false,
  isLoading = false
}: ComponentRendererProps) {
  switch (type) {
    case 'chat':
      return (
        <ChatInterface
          data={data as any}
          onSendMessage={onResponse}
          messages={(data as ChatData).messages || []}
          isLoading={isLoading}
          disabled={disabled}
        />
      );

    case 'yesno':
      return (
        <YesNoQuestion
          data={data as any}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case 'multiselect':
      return (
        <MultiSelectChecklist
          data={data as any}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case 'freetext':
      return (
        <FreeTextInput
          data={data as any}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    case 'slider':
      return (
        <QuantitativeSlider
          data={data as any}
          onResponse={onResponse}
          disabled={disabled}
        />
      );

    default:
      return (
        <div className="text-center p-8">
          <p className="text-muted-foreground">
            Component type "{type}" not implemented yet.
          </p>
        </div>
      );
  }
}