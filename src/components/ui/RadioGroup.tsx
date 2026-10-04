import { useId } from 'react';
import { describedBy } from '@/lib/a11y';
import { cn } from '@/lib/cn';

export type RadioOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type Props = {
  label: string;
  name: string;
  options: RadioOption[];
  /** Controlled. Omit and use defaultValue for uncontrolled. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string;
  help?: string;
  disabled?: boolean;
  required?: boolean;
  orientation?: 'vertical' | 'horizontal';
};

/** One choice from 2-5 visible options. More than that: use Select. */
export default function RadioGroup({
  label,
  name,
  options,
  value,
  defaultValue,
  onChange,
  error,
  help,
  disabled,
  required,
  orientation = 'vertical',
}: Props) {
  const id = useId();
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={describedBy(id, error, help)}
      className="space-y-1.5"
    >
      <legend className="field-label">{label}</legend>
      <div
        className={cn(orientation === 'horizontal' ? 'flex flex-wrap gap-x-6' : 'flex flex-col')}
      >
        {options.map((o) => {
          const optionId = `${id}-${o.value}`;
          return (
            <label
              key={o.value}
              htmlFor={optionId}
              className={cn(
                'flex min-h-11 items-start gap-3 py-2',
                disabled || o.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={o.value}
                disabled={o.disabled}
                required={required}
                {...(value !== undefined
                  ? { checked: value === o.value }
                  : { defaultChecked: defaultValue === o.value })}
                onChange={() => onChange?.(o.value)}
                className="radio-input sr-only"
              />
              <span className="radio-dot" aria-hidden />
              <span className="min-w-0">
                <span className="type-body block">{o.label}</span>
                {o.description && <span className="type-caption block">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {help && !error && (
        <p id={`${id}-help`} className="help-text">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="error-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}
