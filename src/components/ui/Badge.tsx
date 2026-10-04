import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONE: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  brand: 'badge-brand',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

/** Small status label. Always carries text; the dot is decoration, never the only signal. */
export default function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('badge', TONE[tone], className)}>
      {dot && <span className="badge-dot" aria-hidden />}
      {children}
    </span>
  );
}
