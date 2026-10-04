import { cn } from '@/lib/cn';

const SIZE = { md: 'text-xl', lg: 'text-2xl' } as const;

/** "EcoFin" + "Pro" pill. Always LTR, even on RTL pages. */
export default function Wordmark({
  size = 'lg',
  className,
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <div
      dir="ltr"
      className={cn('flex items-center gap-1.5 font-black tracking-tight', SIZE[size], className)}
    >
      <span>
        Eco<span className="text-brand-600">Fin</span>
      </span>
      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold leading-none text-white">
        Pro
      </span>
    </div>
  );
}
