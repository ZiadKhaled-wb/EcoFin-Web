import type { InputHTMLAttributes, KeyboardEvent } from 'react';
import { SearchIcon, XIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name (there is no visible label). */
  label?: string;
};

/**
 * Search box. Follows the page direction (icon on the start side), Esc clears.
 * For barcode scanners pass `autoFocus` and handle Enter with `onKeyDown`.
 */
export default function SearchInput({
  value,
  onValueChange,
  label = t('ui.search'),
  placeholder = t('ui.searchPlaceholder'),
  className,
  onKeyDown,
  ...rest
}: Props) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && value) onValueChange('');
    onKeyDown?.(e);
  };

  return (
    <div role="search" className="relative">
      <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn('field-input ps-11', value && 'pe-11', className)}
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label={t('ui.clearSearch')}
          onClick={() => onValueChange('')}
          className="absolute end-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-control text-ink-mute hover:bg-line hover:text-ink"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
