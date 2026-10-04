import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> & {
  label: ReactNode;
  description?: string;
};

/** On/off setting that applies immediately. For choices inside a form use Checkbox. */
export default function Switch({ label, description, id, disabled, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex min-h-11 items-center justify-between gap-4 py-2',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span className="min-w-0">
        <span className="type-body block">{label}</span>
        {description && <span className="type-caption block">{description}</span>}
      </span>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        disabled={disabled}
        className="switch-input sr-only"
        {...rest}
      />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
    </label>
  );
}
