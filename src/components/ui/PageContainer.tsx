import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Standard page width and padding. Full-bleed screens (POS) skip it on purpose. */
export default function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  );
}
