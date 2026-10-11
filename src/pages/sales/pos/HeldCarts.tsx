import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import { formatDateTime, formatNumber } from '@/lib/format';
import { t } from '@/i18n';
import { POS_SHORTCUTS, focusFirst } from './usePosShortcuts';
import type { HeldCart } from './posStorage';

const NOTE_MAX = 80;

/** Hold: an optional short note, then the cart leaves the screen. Enter holds. */
export function HoldDialog({
  onHold,
  onClose,
}: {
  onHold: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onHold(note);
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('sales.pos.hold.title')}
      description={t('sales.pos.hold.help')}
    >
      <form ref={focusFirst} onSubmit={submit} className="space-y-3">
        <FormField
          label={t('sales.pos.hold.note')}
          value={note}
          maxLength={NOTE_MAX}
          autoComplete="off"
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('sales.pos.hold.cancel')}
          </Button>
          <Button type="submit">{t('sales.pos.hold.confirm')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The carts parked on this device. Resume is offered only while the cart on screen is empty. */
export function HeldCartsDialog({
  carts,
  canResume,
  onResume,
  onDelete,
  onClose,
}: {
  carts: readonly HeldCart[];
  canResume: boolean;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('sales.pos.held.title')}
      description={t('sales.pos.held.help')}
    >
      {carts.length === 0 ? (
        <p className="type-caption">{t('sales.pos.held.empty')}</p>
      ) : (
        <div className="space-y-3" ref={focusFirst}>
          {!canResume && <p className="type-caption">{t('sales.pos.held.finishFirst')}</p>}
          <ul className="divide-y divide-line rounded-control border border-line">
            {carts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="min-w-0">
                  <span className="block truncate" dir="auto">
                    {c.customer
                      ? (c.customer.name ?? t('sales.pos.customer.chosen'))
                      : t('sales.detail.walkIn')}
                  </span>
                  <span className="type-caption block">
                    {formatDateTime(c.at)} ·{' '}
                    {t('sales.pos.held.items', { count: formatNumber(c.lines.length) })}
                  </span>
                  {c.note && (
                    <span className="type-caption block" dir="auto">
                      {c.note}
                    </span>
                  )}
                </span>
                <span className="flex gap-2">
                  {canResume && (
                    <Button size="sm" onClick={() => onResume(c.id)}>
                      {t('sales.pos.held.resume')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)}>
                    {t('sales.pos.held.delete')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

/** The small help that lists the keys. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    [POS_SHORTCUTS.search, t('sales.pos.keys.search')],
    [POS_SHORTCUTS.customer, t('sales.pos.keys.customer')],
    [POS_SHORTCUTS.discount, t('sales.pos.keys.discount')],
    [POS_SHORTCUTS.hold, t('sales.pos.keys.hold')],
    [POS_SHORTCUTS.held, t('sales.pos.keys.held')],
    [POS_SHORTCUTS.pay, t('sales.pos.keys.pay')],
    ['Esc', t('sales.pos.keys.escape')],
    ['Enter', t('sales.pos.keys.enter')],
  ];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={t('sales.pos.keys.title')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(([key, what]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="num type-label" dir="ltr">
                {key}
              </kbd>
            </dt>
            <dd className="type-body">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
