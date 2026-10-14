import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import RadioGroup from '@/components/ui/RadioGroup';
import { branchKeys } from '@/features/me/useBranches';
import { useSettings } from '@/features/settings/useSettings';
import { branchApi } from '@/services/branchApi';
import { salesApi } from '@/services/salesApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { settingsApi } from '@/services/settingsApi';
import { useAuthStore } from '@/store/authStore';
import { t, type Language } from '@/i18n';
import SaleReceipt from './SaleReceipt';
import { ETA_POLL, PRINT_LOG_WAIT_MS, etaOnReceipt, type ReceiptSale } from './receiptRules';
import {
  readReceiptPrefs,
  receiptPageCss,
  saveReceiptPrefs,
  type ReceiptPaper,
} from './receiptPrefs';

/** A logo that neither loads nor fails never blocks the print for longer than this. */
const LOGO_WAIT_MS = 4000;
const MM_PER_PX = 25.4 / 96;

type Props = {
  sale: ReceiptSale;
  /**
   * True where the sale was just made (the POS done card): nothing was printed yet. Elsewhere the
   * sale's own `receipt_prints` says so. The server has the last word when Print is pressed.
   */
  original?: boolean;
};

/**
 * S04 (D68): the Print receipt button with its dialog. Ctrl+P opens the dialog (and prints once
 * it is open) instead of the browser printing the screen.
 */
export default function PrintReceipt({ sale, original = false }: Props) {
  const [open, setOpen] = useState(false);
  /** Prints of this sale so far, as far as this screen knows; null = unknown (treated as a copy). */
  const [prints, setPrints] = useState<number | null>(original ? 0 : (sale.receipt_prints ?? null));
  /** The ETA receipt read again while waiting; kept so a second print doesn't wait. */
  const [eta, setEta] = useState(sale.eta);
  const printNowRef = useRef<(() => void) | null>(null);
  /** What had the focus when the dialog opened; it gets the focus back (New sale after Ctrl+P). */
  const returnToRef = useRef<HTMLElement | null>(null);
  const show = () => {
    returnToRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    const el = returnToRef.current;
    setTimeout(() => el?.isConnected && el.focus(), 0);
  };
  const current: ReceiptSale = { ...sale, eta: eta ?? sale.eta };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'KeyP' && e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      if (open) printNowRef.current?.();
      else show();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <Button variant="secondary" onClick={show}>
        {t('receipts.print')}
      </Button>
      {open && (
        <PrintDialog
          sale={current}
          copy={prints === null || prints > 0}
          printNowRef={printNowRef}
          onEta={setEta}
          onPrinted={(printNo) => setPrints((was) => printNo ?? (was ?? 0) + 1)}
          onClose={close}
        />
      )}
    </>
  );
}

function PrintDialog({
  sale,
  copy,
  printNowRef,
  onEta,
  onPrinted,
  onClose,
}: {
  sale: ReceiptSale;
  copy: boolean;
  printNowRef: RefObject<(() => void) | null>;
  onEta: (eta: ReceiptSale['eta']) => void;
  /** The number the server gave this print; null when it could not be logged. */
  onPrinted: (printNo: number | null) => void;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const settings = useSettings();
  const shop = settings.data;
  const branches = useQuery({
    queryKey: branchKeys.list(orgId),
    queryFn: branchApi.list,
    enabled: !sale.branch,
    staleTime: 60_000,
  });
  const branchName =
    sale.branch?.name ?? branches.data?.find((b) => b.id === sale.branch_id)?.name ?? null;

  const logoId = shop?.receipt_fields.logo ? shop.logo_file_id : null;
  const logo = useQuery({
    queryKey: ['settings-logo', logoId],
    queryFn: () => settingsApi.logoUrl(logoId!),
    enabled: !!logoId,
    retry: false,
  });
  const [logoSettled, setLogoSettled] = useState(false);
  useEffect(() => {
    if (!logoId) return;
    const id = setTimeout(() => setLogoSettled(true), LOGO_WAIT_MS);
    return () => clearTimeout(id);
  }, [logoId]);
  const logoPending = !!logoId && !logo.isError && !logoSettled;

  const [prefs] = useState(readReceiptPrefs);
  const [paper, setPaper] = useState<ReceiptPaper>(prefs.paper ?? 'thermal');
  const [chosenLang, setChosenLang] = useState<Language | undefined>(prefs.lang);
  const lang: Language = chosenLang ?? shop?.default_language ?? 'ar';

  // The ETA receipt is built just after the sale: read the sale again a few times.
  const waiting = !!sale.eta && !sale.eta.qr_payload && sale.eta.status === 'pending';
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!waiting || tries >= ETA_POLL.tries) return;
    let alive = true;
    const id = setTimeout(() => {
      salesApi
        .get(sale.id)
        .then((fresh) => {
          if (alive && fresh.eta) onEta(fresh.eta);
        })
        .catch(() => undefined)
        .finally(() => {
          if (alive) setTries((n) => n + 1);
        });
    }, ETA_POLL.everyMs);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // onEta is a state setter of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, tries, sale.id]);

  const preview = useRef<HTMLDivElement>(null);
  const [pageHeightMm, setPageHeightMm] = useState<number | null>(null);
  const ready = !!shop && !logoPending;
  /** The server's answer for this print: a copy or the original. Until then, what the screen knows. */
  const [stamped, setStamped] = useState<boolean | null>(null);
  const marked = stamped ?? copy;
  const [printing, setPrinting] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    // Set on every mount: StrictMode's dev re-mount runs the cleanup once in between.
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const print = async () => {
    if (!ready || printing) return;
    setPrinting(true);
    // D68: the server numbers the prints of a sale (the first is the original) and logs each one.
    // Without an answer (offline, an expired shop) the print still goes out on what this screen knows.
    let isCopy = copy;
    let printNo: number | null = null;
    try {
      const logged = await Promise.race([
        salesHistoryApi.recordReceiptPrint(sale.id),
        new Promise<never>((_, reject) => setTimeout(reject, PRINT_LOG_WAIT_MS)),
      ]);
      isCopy = logged.copy;
      printNo = logged.print_no;
    } catch {
      /* not logged: printed anyway */
    }
    if (!aliveRef.current) return;
    flushSync(() => setStamped(isCopy));
    // A roll has no page length: make the page as long as the receipt on screen.
    const px = preview.current?.querySelector<HTMLElement>('.receipt')?.offsetHeight ?? 0;
    flushSync(() => setPageHeightMm(px > 0 ? Math.ceil(px * MM_PER_PX) + 6 : null));
    window.print();
    onPrinted(printNo);
    onClose();
  };
  useEffect(() => {
    printNowRef.current = () => void print();
    return () => {
      printNowRef.current = null;
    };
  });

  // Enter prints: the focus goes to Print as soon as it can be pressed.
  const actions = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => actions.current?.querySelector('button')?.focus(), 0);
    return () => clearTimeout(id);
  }, [ready]);

  const receipt = shop && (
    <SaleReceipt
      sale={sale}
      shop={shop}
      branchName={branchName}
      logoUrl={logo.data?.url ?? null}
      lang={lang}
      paper={paper}
      copy={marked}
      onLogoSettled={() => setLogoSettled(true)}
    />
  );
  const withoutQr = !!sale.eta && !etaOnReceipt(sale).qr && sale.eta.status === 'pending';

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('receipts.dialog.title', { number: sale.number })}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('receipts.dialog.close')}
          </Button>
          <span ref={actions}>
            <Button
              disabled={!ready}
              loading={(!!shop && logoPending) || printing}
              onClick={() => void print()}
            >
              {t(withoutQr ? 'receipts.dialog.printWithoutQr' : 'receipts.dialog.printNow')}
            </Button>
          </span>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <RadioGroup
            label={t('receipts.dialog.paper')}
            name="receipt-paper"
            orientation="horizontal"
            value={paper}
            options={[
              {
                value: 'thermal',
                label: t('receipts.dialog.thermal', { width: shop?.receipt_width_mm ?? 80 }),
              },
              { value: 'a4', label: t('receipts.dialog.a4') },
            ]}
            onChange={(v) => {
              const next: ReceiptPaper = v === 'a4' ? 'a4' : 'thermal';
              setPaper(next);
              saveReceiptPrefs({ paper: next });
            }}
          />
          <RadioGroup
            label={t('receipts.dialog.language')}
            name="receipt-language"
            orientation="horizontal"
            value={lang}
            options={[
              { value: 'ar', label: t('receipts.dialog.ar') },
              { value: 'en', label: t('receipts.dialog.en') },
            ]}
            onChange={(v) => {
              const next: Language = v === 'en' ? 'en' : 'ar';
              setChosenLang(next);
              saveReceiptPrefs({ lang: next });
            }}
          />
        </div>
        {marked && <p className="type-caption">{t('receipts.dialog.copyNote')}</p>}
        {waiting && (
          <p className="type-caption" role="status">
            {t(
              tries >= ETA_POLL.tries
                ? 'receipts.dialog.etaNotReady'
                : 'receipts.dialog.etaWaiting',
            )}
          </p>
        )}
        {settings.isError && !shop ? (
          <div role="alert" className="space-y-2">
            <p>{t('receipts.dialog.settingsFailed')}</p>
            <Button variant="secondary" onClick={() => void settings.refetch()}>
              {t('receipts.dialog.retry')}
            </Button>
          </div>
        ) : !receipt ? (
          <p role="status">{t('receipts.dialog.loading')}</p>
        ) : (
          <section aria-label={t('receipts.dialog.preview')}>
            <div ref={preview} className="receipt-preview rounded-control" dir="ltr">
              {receipt}
            </div>
          </section>
        )}
      </div>
      {/* Only this prints (index.css hides the rest of the page when printing). */}
      {shop &&
        createPortal(
          <div className="print-root" data-receipt-print dir="ltr">
            <style>{receiptPageCss(paper, shop.receipt_width_mm, pageHeightMm)}</style>
            {receipt}
          </div>,
          document.body,
        )}
    </Dialog>
  );
}
