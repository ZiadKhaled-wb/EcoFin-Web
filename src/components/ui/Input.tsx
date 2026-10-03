import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EyeIcon, EyeOffIcon } from '@/components/ui/Icons';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Red border (error styling) without rendering a message. */
  invalid?: boolean;
  /** Leading icon, shown at the physical left of the (LTR) input. */
  icon?: ReactNode;
  /** Force LTR for emails, usernames, codes. Password inputs are always LTR. */
  ltr?: boolean;
};

/**
 * Bare input (no label). Use FormField for labelled fields.
 * type="password" gets a show/hide toggle automatically.
 */
export default function Input({ invalid, icon, ltr, type, className, ...rest }: InputProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const isLtr = ltr || isPassword;

  return (
    // Icon and toggle use physical left/right on purpose: LTR inputs inside an RTL page.
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute">
          {icon}
        </span>
      )}
      <input
        type={isPassword && visible ? 'text' : type}
        dir={isLtr ? 'ltr' : undefined}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          'field-input',
          isLtr && 'font-mono text-[0.9375rem]',
          invalid && 'field-input-error',
          !!icon && 'pl-11',
          isPassword && 'pr-12',
          className,
        )}
        {...rest}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-control text-ink-mute hover:bg-line hover:text-ink"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      )}
    </div>
  );
}
