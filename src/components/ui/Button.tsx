import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** sm 36px (dense desktop tables only) · md 48px (default) · lg 56px (POS) */
  size?: ButtonSize;
  loading?: boolean;
  /** Text shown while loading. Defaults to the normal children. */
  loadingLabel?: string;
  fullWidth?: boolean;
  /** Leading icon (hidden while loading). */
  icon?: ReactNode;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};
const SIZE: Record<ButtonSize, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

/** The only button. Defaults to type="button" so it never submits by accident. */
export default function Button({
  variant = "primary",
  size = "md",
  loading,
  loadingLabel,
  fullWidth,
  icon,
  type = "button",
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("btn", VARIANT[variant], SIZE[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
}