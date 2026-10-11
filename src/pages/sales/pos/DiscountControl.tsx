import type { RefObject } from 'react';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import { t } from '@/i18n';
import type { DiscountDraft } from './posStorage';

/**
 * S06 over S03: a discount as the cashier types it, an amount or a percent. The value stays text
 * (never a JS number); the server turns it into money and the quote shows the result.
 */
export default function DiscountControl({
  value,
  onChange,
  typeLabel,
  valueLabel,
  valueRef,
  shortcut,
}: {
  value: DiscountDraft;
  onChange: (next: DiscountDraft) => void;
  typeLabel: string;
  valueLabel: string;
  /** The element around the value field (for the shortcut's focus). */
  valueRef?: RefObject<HTMLDivElement | null>;
  shortcut?: string;
}) {
  return (
    <div className="flex items-end gap-2 [&_.field-label]:sr-only">
      <div className="w-24 shrink-0">
        <Select
          label={typeLabel}
          value={value.type}
          options={[
            { value: 'percent', label: '%' },
            { value: 'amount', label: t('common.currency') },
          ]}
          onChange={(e) =>
            onChange({ ...value, type: e.target.value === 'amount' ? 'amount' : 'percent' })
          }
        />
      </div>
      <div className="w-28 shrink-0" ref={valueRef}>
        <NumberInput
          label={valueLabel}
          value={value.value}
          decimals={2}
          maxLength={12}
          placeholder="0"
          onValueChange={(v) => onChange({ ...value, value: v })}
          {...(shortcut ? { 'aria-keyshortcuts': shortcut } : {})}
        />
      </div>
    </div>
  );
}
