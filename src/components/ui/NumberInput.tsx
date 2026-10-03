import { useId, type FocusEvent } from 'react';
import FieldShell from '@/components/ui/FieldShell';
import Input, { type InputProps } from '@/components/ui/Input';
import { describedBy } from '@/lib/a11y';
import { cn } from '@/lib/cn';
import { padDecimals, sanitizeDecimal } from '@/lib/number';

type Props = Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'ltr' | 'icon'> & {
  label: string;
  /** String on purpose (never a float). "" means empty. */
  value: string;
  onValueChange: (value: string) => void;
  /** Max fraction digits. 0 = integers only. Padded on blur (2 -> "12.50"). */
  decimals?: number;
  allowNegative?: boolean;
  /** Unit shown at the end of the field, e.g. "ج.م" or "قطعة". */
  suffix?: string;
  error?: string;
  help?: string;
};

/**
 * Numeric text input. Accepts Arabic-Indic digits (٠-٩) and stores Latin digits.
 * Uses inputMode="decimal" for the right mobile keypad and avoids type="number"
 * (scroll-wheel changes, exponent input, locale issues).
 */
export default function NumberInput({
  label,
  value,
  onValueChange,
  decimals = 0,
  allowNegative = false,
  suffix,
  error,
  help,
  id,
  invalid,
  className,
  onBlur,
  ...rest
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    onValueChange(padDecimals(value, decimals));
    onBlur?.(e);
  };

  return (
    <FieldShell id={inputId} label={label} error={error} help={help}>
      <div className="relative">
        <Input
          id={inputId}
          ltr
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          onChange={(e) =>
            onValueChange(sanitizeDecimal(e.target.value, { decimals, allowNegative }))
          }
          onBlur={handleBlur}
          invalid={!!error || invalid}
          aria-describedby={describedBy(inputId, error, help)}
          className={cn('text-right', suffix && 'pr-16', className)}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-mute">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}
