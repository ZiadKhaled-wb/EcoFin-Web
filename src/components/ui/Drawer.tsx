import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import IconButton from '@/components/ui/IconButton';
import { XIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/cn';

/**
 * Side sheet on Radix Dialog: focus trap, Esc to close, focus returns to the trigger,
 * scroll lock and aria roles are handled by Radix. `start` = right edge in RTL.
 * Use for: mobile navigation, edit/preview of a record beside a list.
 */
export default function Drawer({
  open,
  onOpenChange,
  title,
  side = 'start',
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-(--z-overlay) bg-ink/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'drawer-panel fixed inset-y-0 z-(--z-modal) flex w-80 max-w-[85vw] flex-col bg-surface shadow-overlay outline-none',
            side === 'start' ? 'drawer-start start-0' : 'drawer-end end-0',
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Dialog.Title className="type-section-title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="إغلاق" icon={<XIcon />} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
