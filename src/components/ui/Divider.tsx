import { cn } from '@/lib/cn';

export default function Divider({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'bg-line',
        orientation === 'vertical' ? 'mx-2 w-px self-stretch' : 'h-px w-full',
        className,
      )}
    />
  );
}
