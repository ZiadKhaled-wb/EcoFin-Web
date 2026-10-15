import { useId, type SelectHTMLAttributes } from 'react';
import FieldShell from '@/components/ui/FieldShell';
import { describedBy } from '@/lib/a11y';
import { ChevronDownIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/cn';

/** `group`: consecutive options with the same group are listed under that heading (<optgroup>). */
export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string };

/** Consecutive options of the same group, in order (an option without a group is its own run). */
function runs(options: SelectOption[]): { group?: string; items: SelectOption[] }[] {
  const out: { group?: string; items: SelectOption[] }[] = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && o.group !== undefined && last.group === o.group) last.items.push(o);
    else out.push({ group: o.group, items: [o] });
  }
  return out;
}

const renderOption = (o: SelectOption) => (
  <option key={o.value} value={o.value} disabled={o.disabled}>
    {o.label}
  </option>
);

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  options: SelectOption[];
  /** Empty first option, e.g. "اختر...". Value is "" so `required` works. */
  placeholder?: string;
  error?: string;
  help?: string;
  invalid?: boolean;
};

/**
 * Native <select> on purpose: best accessibility, keyboard and mobile pickers.
 * Use a combobox (future) only when you need search or multi-select.
 */
export default function Select({
  label,
  options,
  placeholder,
  error,
  help,
  invalid,
  id,
  className,
  ...rest
}: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const bad = !!error || invalid;

  return (
    <FieldShell id={selectId} label={label} error={error} help={help}>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={bad ? true : undefined}
          aria-describedby={describedBy(selectId, error, help)}
          className={cn('field-input appearance-none pe-10', bad && 'field-input-error', className)}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {runs(options).map((run) =>
            run.group === undefined ? (
              run.items.map(renderOption)
            ) : (
              <optgroup key={`group-${run.group}`} label={run.group}>
                {run.items.map(renderOption)}
              </optgroup>
            ),
          )}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
      </div>
    </FieldShell>
  );
}
