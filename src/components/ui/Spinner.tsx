import { cn } from '@/lib/cn';

const SIZE = { sm: 'size-4', md: 'size-6', lg: 'size-8' } as const;

/** Standalone loading indicator. Inside buttons, use Button's `loading` prop instead. */
export default function Spinner({
  size = 'md',
  label = 'جارٍ التحميل',
  className,
}: {
  size?: keyof typeof SIZE;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('spinner text-brand-600', SIZE[size], className)}
    />
  );
}
