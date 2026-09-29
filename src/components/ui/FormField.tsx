import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  help?: string;
  /** Red border without a message (e.g. the generic login error). */
  invalid?: boolean;
  /** Leading icon, shown at the physical left of the (LTR) input. */
  icon?: ReactNode;
  /** Force LTR for emails, usernames, codes. Password fields are always LTR. */
  ltr?: boolean;
};

/**
 * Label + input + help + error, in one place. Every form uses this.
 * type="password" gets a show/hide toggle automatically.
 */
export default function FormField({
  label,
  error,
  help,
  invalid,
  icon,
  ltr,
  type,
  id,
  className,
  ...rest
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const isLtr = ltr || isPassword;

  const describedBy =
    [error && `${inputId}-error`, help && `${inputId}-help`].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      {/* Icon and toggle use physical left/right on purpose: LTR inputs inside an RTL page. */}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={isPassword && visible ? "text" : type}
          dir={isLtr ? "ltr" : undefined}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "field-input",
            isLtr && "font-mono text-[0.9375rem]",
            (error || invalid) && "field-input-error",
            !!icon && "pl-11",
            isPassword && "pr-12",
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-control text-ink-mute hover:bg-line hover:text-ink"
            aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            aria-pressed={visible}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {help && !error && (
        <p id={`${inputId}-help`} className="help-text">
          {help}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}