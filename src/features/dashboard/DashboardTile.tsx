import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Badge from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

export type TileAttention = 'warning' | 'danger';

export interface TileLine {
  /** Text of the line. */
  text: string;
  /** A line that opens another page (a part of the number, e.g. the drawers of the cash tile). */
  to?: string;
}

const ATTENTION: Record<TileAttention, string> = {
  warning: 'border-ochre-500 bg-ochre-50',
  danger: 'border-danger-600 bg-danger-50',
};

/**
 * One number of the owner dashboard. The whole tile is a link to the page that lists what is behind
 * the number (a stretched link on the title), opened with the same filters. A tile that has parts
 * with their own pages lists them as lines with their own links, above the stretched one. The
 * colour marks attention only; the badge says the same in words.
 */
export default function DashboardTile({
  id,
  title,
  value,
  to,
  lines = [],
  attention,
  children,
}: {
  id: string;
  title: string;
  /** The main number, formatted by the caller from the server's value. */
  value: string;
  to: string;
  lines?: TileLine[];
  attention?: TileAttention;
  children?: ReactNode;
}) {
  return (
    <article
      data-tile={id}
      data-attention={attention ?? undefined}
      className={cn(
        'relative rounded-panel border p-5 transition-colors focus-within:ring-2 focus-within:ring-brand-500 hover:border-brand-700',
        attention ? ATTENTION[attention] : 'border-line bg-surface',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="type-label min-w-0">
          <Link
            to={to}
            className="after:absolute after:inset-0 after:rounded-panel focus:outline-none"
          >
            {title}
          </Link>
        </h3>
        {attention && (
          <Badge tone={attention} dot>
            {t('dashboard.attention')}
          </Badge>
        )}
      </div>
      <p className="type-display num mt-2 break-words" dir="auto">
        {value}
      </p>
      {lines.length > 0 && (
        <ul className="type-caption mt-3 space-y-1">
          {lines.map((line) => (
            <li key={line.text}>
              {line.to ? (
                <Link to={line.to} className="relative z-10 text-brand-700 hover:underline">
                  {line.text}
                </Link>
              ) : (
                line.text
              )}
            </li>
          ))}
        </ul>
      )}
      {children}
    </article>
  );
}
