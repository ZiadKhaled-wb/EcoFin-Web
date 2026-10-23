import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  OFFLINE_WARN_AFTER_HOURS,
  compareMoney,
  subtractMoney,
  type OfflineSnapshotProduct,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import Notice from '@/components/ui/Notice';
import SaleReceipt from '@/features/receipts/SaleReceipt';
import { receiptPageCss } from '@/features/receipts/receiptPrefs';
import { formatMoney } from '@/lib/format';
import { getLanguage, t } from '@/i18n';
import { offlineReceiptSale } from '@/offline/receiptSale';
import {
  OfflineSaleRefused,
  markPrinted,
  offlineTotals,
  recordOfflineSale,
  type OfflineCartLine,
} from '@/offline/sale';
import { canSellOffline, useOfflineStore } from '@/offline/store';
import type { OfflineEntry } from '@/offline/types';
import OfflineLock, { SetPinCard } from './OfflineLock';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const productName = (p: { name_ar: string; name_en: string | null }) =>
  getLanguage() === 'en' && p.name_en ? p.name_en : p.name_ar;

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

const hoursMinutes = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

/** D14.6: offline, what waits to sync and how long offline selling may go on. */
export function OfflineBanner() {
  const store = useOfflineStore();
  const now = useNow();
  const waiting = store.unsynced > 0;
  if (store.mode.mode !== 'offline' && !waiting) return null;
  const lease = store.lease;
  const left = lease ? Date.parse(lease.lease.expires_at) - (now + lease.offsetMs) : 0;
  const late =
    store.oldestUnsyncedAt !== null &&
    now - Date.parse(store.oldestUnsyncedAt) >= OFFLINE_WARN_AFTER_HOURS * 3_600_000;
  return (
    <div role="status" className="space-y-1" data-testid="offline-banner">
      {late && <Notice tone="error">{t('offline.banner.deadline')}</Notice>}
      <Notice tone={store.mode.mode === 'online' || canSellOffline(store, now) ? 'info' : 'error'}>
        {store.mode.mode === 'offline' && (
          <>
            <span className="font-semibold">{t('offline.banner.offline')}</span>
            {' · '}
          </>
        )}
        <span data-testid="offline-unsynced">
          {t('offline.banner.unsynced', { count: store.unsynced })}
        </span>
        {store.mode.mode === 'offline' && (
          <>
            {' · '}
            {!lease || !lease.persisted
              ? t('offline.banner.unavailable')
              : left > 0
                ? t('offline.banner.leaseLeft', { time: hoursMinutes(left) })
                : t('offline.banner.expired')}
          </>
        )}
      </Notice>
    </div>
  );
}

/**
 * The POS route (S06) with S08 around it: online, the normal screen (with the banner while sales
 * wait to sync, and the PIN to set for the shift); offline, the PIN lock and the offline sale
 * screen, which need nothing from the server.
 */
export function PosRoute({ children }: { children: ReactNode }) {
  const mode = useOfflineStore((s) => s.mode.mode);
  const lease = useOfflineStore((s) => s.lease);
  const pinShift = useOfflineStore((s) => s.pinShift);
  const unlocked = useOfflineStore((s) => s.unlocked);
  if (mode === 'online') {
    return (
      <>
        <OfflineBanner />
        {lease && lease.persisted && pinShift !== lease.lease.shift_id && (
          <SetPinCard shiftId={lease.lease.shift_id} />
        )}
        {children}
      </>
    );
  }
  return (
    <div className="space-y-4">
      <OfflineBanner />
      {!lease || pinShift !== lease.lease.shift_id ? (
        <Notice tone="error">{t('offline.pos.refusals.NO_LEASE')}</Notice>
      ) : unlocked ? (
        <OfflinePos />
      ) : (
        <OfflineLock />
      )}
    </div>
  );
}

/** The cash-only sale screen of the offline POS (D4): snapshot products, walk-in customer. */
export function OfflinePos() {
  const store = useOfflineStore();
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<OfflineCartLine[]>([]);
  const [tendered, setTendered] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // D1.4: an online sale saved offline arrives here to be printed.
  const [done, setDone] = useState<OfflineEntry | null>(() => useOfflineStore.getState().fallback);
  useEffect(() => {
    if (useOfflineStore.getState().fallback) useOfflineStore.getState().set({ fallback: null });
  }, []);
  const products = useMemo(() => store.snapshot?.data.products ?? [], [store.snapshot]);
  const prices = store.snapshot?.data.prices_include_vat ?? true;
  const totals = lines.length > 0 ? offlineTotals(lines, prices) : null;
  const sold = store.counters?.leaseId === store.lease?.lease.id ? store.counters : null;

  const found = useMemo(() => {
    const raw = query.trim();
    const q = raw.toLowerCase();
    if (q === '') return [];
    return products
      .filter(
        (p) =>
          p.name_ar.toLowerCase().includes(q) ||
          (p.name_en ?? '').toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcodes.includes(raw),
      )
      .slice(0, 20);
  }, [products, query]);

  if (done) return <OfflineDoneCard entry={done} onNew={() => setDone(null)} />;

  const left = (p: OfflineSnapshotProduct) =>
    (p.on_hand ?? 0) -
    (sold?.sold[p.id] ?? 0) -
    lines.filter((l) => l.product.id === p.id).reduce((n, l) => n + l.quantity, 0);
  const freeUnits = (p: OfflineSnapshotProduct) =>
    p.units.filter(
      (u) =>
        !(sold?.serials ?? []).includes(u.unit_id) &&
        !lines.some((l) => l.unit?.unit_id === u.unit_id),
    );

  function add(product: OfflineSnapshotProduct, unit: { unit_id: string; serial: string } | null) {
    setError('');
    setLines((list) => {
      if (!product.is_serialized) {
        const at = list.findIndex((l) => l.product.id === product.id);
        if (at >= 0) return list.map((l, i) => (i === at ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...list, { product, quantity: 1, unit }];
    });
  }

  async function pay() {
    if (!store.db || !store.lease || !store.snapshot || busy || !totals) return;
    const cash = tendered.trim() === '' ? totals.total : tendered.trim();
    if (!MONEY.test(cash)) return setError(t('offline.pos.refusals.TENDERED_SHORT'));
    setBusy(true);
    try {
      const entry = await recordOfflineSale({
        db: store.db,
        lease: store.lease,
        snapshot: store.snapshot,
        lines,
        tendered: cash,
        idempotencyKey: crypto.randomUUID(),
      });
      await store.reload();
      setLines([]);
      setTendered('');
      setQuery('');
      setDone(entry);
    } catch (err) {
      setError(
        err instanceof OfflineSaleRefused
          ? t(`offline.pos.refusals.${err.code}`)
          : t('offline.errors.failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="offline-pos">
      <Card>
        <div className="space-y-3">
          <h2 className="type-section-title">{t('offline.pos.title')}</h2>
          <p className="type-caption">{t('offline.pos.rules')}</p>
          <FormField
            label={t('offline.pos.search')}
            placeholder={t('offline.pos.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="offline-search"
          />
          {query.trim() !== '' && found.length === 0 && (
            <p className="type-caption">{t('offline.pos.noResults')}</p>
          )}
          <ul className="space-y-2">
            {found.map((p) => (
              <li
                key={p.id}
                data-testid="offline-product"
                className={`flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-2 ${p.offline_sellable ? '' : 'opacity-60'}`}
              >
                <span>
                  <span className="type-body">{productName(p)}</span>{' '}
                  <span className="type-caption num">{p.price ? formatMoney(p.price) : ''}</span>{' '}
                  <span className="type-caption">
                    {!p.offline_sellable
                      ? t(`offline.pos.notSellable.${p.reason ?? 'NO_PRICE'}`)
                      : p.is_serialized
                        ? ''
                        : t('offline.pos.inStock', { count: left(p) })}
                  </span>
                </span>
                {p.offline_sellable &&
                  (p.is_serialized ? (
                    <select
                      aria-label={t('offline.pos.chooseUnit')}
                      className="field-input w-auto"
                      value=""
                      onChange={(e) => {
                        const unit = p.units.find((u) => u.unit_id === e.target.value);
                        if (unit) add(p, unit);
                      }}
                    >
                      <option value="">{t('offline.pos.chooseUnit')}</option>
                      {freeUnits(p).map((u) => (
                        <option key={u.unit_id} value={u.unit_id}>
                          {u.serial}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={left(p) <= 0}
                      onClick={() => add(p, null)}
                    >
                      {t('offline.pos.add')}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card>
        <div className="space-y-3">
          {lines.length === 0 ? (
            <p className="type-body">{t('offline.pos.empty')}</p>
          ) : (
            <ul className="space-y-2" data-testid="offline-cart">
              {lines.map((l, i) => (
                <li
                  key={l.unit?.unit_id ?? l.product.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    {productName(l.product)}
                    {l.unit ? ` (${l.unit.serial})` : ''} × {l.quantity}
                  </span>
                  <span className="num">
                    {totals?.lines[i] ? formatMoney(totals.lines[i].line_total) : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((list) => list.filter((_, j) => j !== i))}
                  >
                    {t('offline.pos.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {totals && (
            <dl className="type-body grid grid-cols-2 gap-1">
              <dt>{t('offline.pos.subtotal')}</dt>
              <dd className="num">{formatMoney(totals.subtotal)}</dd>
              <dt>{t('offline.pos.tax')}</dt>
              <dd className="num">{formatMoney(totals.tax_total)}</dd>
              <dt className="font-semibold">{t('offline.pos.total')}</dt>
              <dd className="num font-semibold" data-testid="offline-total">
                {formatMoney(totals.total)}
              </dd>
            </dl>
          )}
          <FormField
            label={t('offline.pos.tendered')}
            inputMode="decimal"
            ltr
            value={tendered}
            placeholder={totals?.total ?? ''}
            onChange={(e) => setTendered(e.target.value)}
            data-testid="offline-tendered"
          />
          {totals && MONEY.test(tendered) && compareMoney(tendered, totals.total) >= 0 && (
            <p className="type-body">
              {t('offline.pos.change')}:{' '}
              <span className="num">{formatMoney(subtractMoney(tendered, totals.total))}</span>
            </p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            onClick={() => void pay()}
            loading={busy}
            disabled={lines.length === 0}
            data-testid="offline-pay"
          >
            {t('offline.pos.pay')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** After an offline sale: its number and change, the receipt to print, the next sale. */
export function OfflineDoneCard({ entry, onNew }: { entry: OfflineEntry; onNew: () => void }) {
  return (
    <Card>
      <div className="space-y-3" role="status" data-testid="offline-done">
        <h2 className="type-section-title">
          {t('offline.pos.done.title', { number: entry.number })}
        </h2>
        <p className="type-body">{t('offline.pos.done.body')}</p>
        {compareMoney(entry.change, '0.00') > 0 && (
          <p className="type-section-title">
            {t('offline.pos.change')}: <span className="num">{formatMoney(entry.change)}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <OfflinePrint entry={entry} />
          <Button variant="secondary" onClick={onNew}>
            {t('offline.pos.newSale')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * S04's receipt of an offline sale, printed from what the device stored: the first print is the
 * original (D6.6: a crash before printing prints the original again), every later one a copy.
 */
export function OfflinePrint({ entry }: { entry: OfflineEntry }) {
  const db = useOfflineStore((s) => s.db);
  const shop = useOfflineStore((s) => s.lease?.shop ?? null);
  const [open, setOpen] = useState(false);
  const [printed, setPrinted] = useState(entry.printed);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const sale = offlineReceiptSale(entry);
  const lang = getLanguage();
  const receipt = shop && (
    <SaleReceipt
      sale={sale}
      shop={shop}
      branchName={null}
      logoUrl={null}
      lang={lang}
      paper="thermal"
      copy={printed}
    />
  );
  async function print() {
    const px = preview.current?.querySelector<HTMLElement>('.receipt')?.offsetHeight ?? 0;
    flushSync(() => setHeightMm(px > 0 ? Math.ceil((px * 25.4) / 96) + 6 : null));
    window.print();
    if (db && !printed) await markPrinted(db, entry.seq);
    setPrinted(true);
    setOpen(false);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="offline-print">
        {t('offline.pos.print')}
      </Button>
      {open && (
        <Dialog
          open
          onOpenChange={(v) => !v && setOpen(false)}
          title={t('receipts.dialog.title', { number: entry.number })}
          className="max-w-2xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t('receipts.dialog.close')}
              </Button>
              <Button disabled={!shop} onClick={() => void print()} data-testid="offline-print-now">
                {t('receipts.dialog.printNow')}
              </Button>
            </>
          }
        >
          {printed && <p className="type-caption">{t('receipts.dialog.copyNote')}</p>}
          <section aria-label={t('receipts.dialog.preview')}>
            <div
              ref={preview}
              className="receipt-preview rounded-control"
              dir="ltr"
              data-testid="offline-receipt"
            >
              {receipt}
            </div>
          </section>
          {shop &&
            createPortal(
              <div className="print-root" data-receipt-print dir="ltr">
                <style>{receiptPageCss('thermal', shop.receipt_width_mm, heightMm)}</style>
                {receipt}
              </div>,
              document.body,
            )}
        </Dialog>
      )}
    </>
  );
}
