import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import { XIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * Centered modal on Radix Dialog: focus trap, Esc closes, focus returns to the trigger.
 * For a short form (<= 5 fields) or one decision. Anything longer is a page or a Drawer.
 */
export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="drawer-overlay fixed inset-0 z-(--z-overlay) bg-ink/40" />
        <RadixDialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed start-1/2 top-1/2 z-(--z-modal) flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md -translate-y-1/2 flex-col rounded-panel border border-line bg-surface shadow-overlay outline-none rtl:translate-x-1/2 ltr:-translate-x-1/2',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 px-6 pt-6">
            <div className="min-w-0 space-y-1">
              <RadixDialog.Title className="type-section-title">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="type-caption">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label={t('ui.close')} icon={<XIcon />} />
            </RadixDialog.Close>
          </div>
          {children && <div className="min-h-0 overflow-y-auto px-6 py-4">{children}</div>}
          {footer && (
            <div className="flex flex-wrap justify-end gap-3 px-6 pb-6 pt-2">{footer}</div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** One decision. Name the item and the amount in `description` for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = t('ui.confirm'),
  cancelLabel = t('ui.cancel'),
  tone = 'primary',
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
