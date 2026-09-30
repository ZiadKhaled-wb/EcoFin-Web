import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { CheckIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/cn";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    label: ReactNode;
    description?: string;
    error?: string;
};

/** Whole row is the click target (>= 44px tall). Native input stays for a11y and forms. */
export default function Checkbox({ label, description, error, id, disabled, ...rest }: Props) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
        <div>
        <label
            htmlFor={inputId}
            className={cn(
            "flex min-h-11 items-start gap-3 py-2",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
        >
            <input
            id={inputId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="check-input sr-only"
            {...rest}
            />
            <span className="check-box" aria-hidden>
            <CheckIcon width={14} height={14} strokeWidth={2.5} />
            </span>
            <span className="min-w-0">
            <span className="type-body block">{label}</span>
            {description && <span className="type-caption block">{description}</span>}
            </span>
        </label>
        {error && (
            <p id={`${inputId}-error`} role="alert" className="error-text ps-8">
            {error}
            </p>
        )}
        </div>
    );
}