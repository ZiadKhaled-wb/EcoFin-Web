import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Bordered surface. Borders carry structure; `elevated` adds the resting shadow (use sparingly). */
export default function Card({
  title,
  description,
  actions,
  elevated,
  padded = true,
  className,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  elevated?: boolean;
  /** Set false for full-bleed content such as tables. */
  padded?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-panel border border-line bg-surface',
        elevated && 'shadow-card',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="type-section-title">{title}</h2>}
            {description && <p className="type-caption mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5')}>{children}</div>
    </section>
  );
}
