import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  variant?: "primary" | "secondary";
};

export default function SubmitButton({
  label,
  loading,
  loadingLabel,
  variant = "primary",
  type = "submit",
  disabled,
  className,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("btn w-full", variant === "primary" ? "btn-primary" : "btn-secondary", className)}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden />}
      {loading ? (loadingLabel ?? label) : label}
    </button>
  );
}
