import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  StockCountLine,
  StockCountLineBody,
  StockCountLineFilter,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import DataTable from '@/components/ui/DataTable';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import Input from '@/components/ui/Input';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { formatNumber } from '@/lib/format';
import { stockApi, stockKeys, type CountDetailParams } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import { COUNT_TONE, countError } from './countShared';

const PAGE_SIZE = 50;
const SAVE_CHUNK = 500;
const FILTERS: StockCountLineFilter[] = ['all', 'uncounted', 'different'];

/** An unsaved counted quantity: '' = not counted. */
interface Edit {
  product_id: string;
  unit_id: string | null;
  value: string;
}

const lineName = (l: StockCountLine) =>
  getLanguage() === 'en' && l.name_en ? l.name_en : l.name_ar;

/** I02 count sheet: scan or type counted quantities, review the differences, post or cancel. */
export default function CountSheetPage() {
  const { id = '' } = useParams();
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const branches = useBranches();
  const [filter, setFilter] = useState<StockCountLineFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [code, setCode] = useState('');
  const [scanNote, setScanNote] = useState('');
  const [scanError, setScanError] = useState('');
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params: CountDetailParams = {
    filter,
    ...(search ? { search } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const detail = useQuery({
    queryKey: stockKeys.countLines(orgId, id, params),
    queryFn: () => stockApi.count(id, params),
    placeholderData: keepPreviousData,
  });
  const count = detail.data;
  const open = count?.status === 'open';
  const refresh = () => cache.invalidateQueries({ queryKey: stockKeys.all(orgId) });

  async function scan(e: FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setScanError('');
    setScanNote('');
    try {
      const line = await stockApi.scan(id, value);
      setEdits((m) => {
        const next = new Map(m);
        next.delete(line.id);
        return next;
      });
      setScanNote(
        line.serial
          ? t('stock.counts.sheet.scannedSerial', { name: lineName(line), serial: line.serial })
          : t('stock.counts.sheet.scanned', {
              name: lineName(line),
              counted: formatNumber(line.counted_qty ?? 0),
            }),
      );
      setCode('');
      await refresh();
    } catch (err) {
      setScanError(countError(err));
      // A barcode gun types the next code straight away: start from an empty field.
      setCode('');
    }
    scanRef.current?.focus();
  }

  function edit(line: StockCountLine, value: string) {
    setEdits((m) => {
      const next = new Map(m);
      next.set(line.id, { product_id: line.product_id, unit_id: line.unit_id, value });
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      const lines: StockCountLineBody[] = [...edits.values()].map((e) => ({
        product_id: e.product_id,
        ...(e.unit_id ? { unit_id: e.unit_id } : {}),
        counted_qty: e.value === '' ? null : Number(e.value),
      }));
      for (let i = 0; i < lines.length; i += SAVE_CHUNK) {
        await stockApi.saveCountLines(id, lines.slice(i, i + SAVE_CHUNK));
      }
      setEdits(new Map());
      notify.success(t('stock.counts.sheet.saved'));
      await refresh();
    } catch (err) {
      notify.error(countError(err));
    } finally {
      setBusy(false);
    }
  }

  const branchName = (branches.data ?? []).find((b) => b.id === count?.branch_id)?.name ?? '';
  const shown = (l: StockCountLine) =>
    edits.get(l.id)?.value ?? (l.counted_qty === null ? '' : String(l.counted_qty));

  const columns: ColumnDef<StockCountLine, unknown>[] = [
    {
      id: 'product',
      header: t('stock.counts.sheet.columns.product'),
      cell: ({ row }) => (
        <span>
          <span className="block">{lineName(row.original)}</span>
          <span className="type-caption block" dir="ltr">
            {row.original.sku}
          </span>
        </span>
      ),
    },
    {
      id: 'serial',
      header: t('stock.counts.sheet.columns.serial'),
      cell: ({ row }) => <span dir="ltr">{row.original.serial ?? ''}</span>,
    },
    {
      id: 'expected',
      header: t('stock.counts.sheet.columns.expected'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.expected_qty),
    },
    {
      id: 'counted',
      header: t('stock.counts.sheet.columns.counted'),
      cell: ({ row }) => {
        const l = row.original;
        if (!open) {
          return l.counted_qty === null ? '' : formatNumber(l.counted_qty);
        }
        const label = `${t('stock.counts.sheet.columns.counted')}: ${lineName(l)}${l.serial ? ` ${l.serial}` : ''}`;
        // The column header names the field; the label stays for screen readers only.
        return (
          <div className="w-44 [&_.field-label]:sr-only">
            {l.unit_id ? (
              <Select
                label={label}
                value={shown(l)}
                options={[
                  { value: '', label: t('stock.counts.sheet.notCounted') },
                  { value: '1', label: t('stock.counts.sheet.unitHere') },
                  { value: '0', label: t('stock.counts.sheet.unitMissing') },
                ]}
                onChange={(e) => edit(l, e.target.value)}
              />
            ) : (
              <NumberInput
                label={label}
                value={shown(l)}
                decimals={0}
                maxLength={7}
                placeholder={t('stock.counts.sheet.notCounted')}
                onValueChange={(v) => edit(l, v)}
              />
            )}
          </div>
        );
      },
    },
    {
      id: 'difference',
      header: t('stock.counts.sheet.columns.difference'),
      meta: { numeric: true },
      cell: ({ row }) => {
        const value = shown(row.original);
        if (value === '') return '';
        const diff = Number(value) - row.original.expected_qty;
        return (
          <span className={diff < 0 ? 'text-danger-700' : diff > 0 ? 'text-success-700' : ''}>
            {diff > 0 ? '+' : ''}
            {formatNumber(diff)}
          </span>
        );
      },
    },
  ];

  if (detail.isError && !count) {
    return (
      <PageContainer>
        <ErrorState
          title={t('stock.counts.sheet.loadFailed')}
          onRetry={() => void detail.refetch()}
        />
      </PageContainer>
    );
  }

  const uncounted = count ? count.lines_total - count.lines_counted : 0;
  return (
    <PageContainer>
      <PageHeader
        title={t('stock.counts.sheet.title', { number: count?.number ?? '' })}
        actions={
          <>
            <Link to="/inventory/counts" className="btn btn-ghost">
              {t('stock.counts.sheet.back')}
            </Link>
            {open && (
              <>
                <Button variant="secondary" onClick={() => setCancelling(true)}>
                  {t('stock.counts.sheet.cancel')}
                </Button>
                <Button disabled={edits.size > 0} onClick={() => setPosting(true)}>
                  {t('stock.counts.sheet.post')}
                </Button>
              </>
            )}
          </>
        }
      />
      {count && (
        <Card className="mb-4 p-4">
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="type-label">{t('stock.counts.sheet.branch')}</dt>
              <dd>{branchName}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.counts.sheet.category')}</dt>
              <dd>{count.category_name ?? t('stock.counts.wholeBranch')}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.counts.status')}</dt>
              <dd>
                <Badge tone={COUNT_TONE[count.status]}>
                  {t(`stock.counts.statuses.${count.status}`)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.counts.sheet.counted')}</dt>
              <dd>
                {t('stock.counts.progress', {
                  counted: formatNumber(count.lines_counted),
                  total: formatNumber(count.lines_total),
                })}
              </dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.counts.sheet.different')}</dt>
              <dd>{formatNumber(count.lines_different)}</dd>
            </div>
            <div>
              <dt className="type-label">
                {t('stock.counts.sheet.in')} / {t('stock.counts.sheet.out')}
              </dt>
              <dd>
                <span dir="ltr">
                  +{formatNumber(count.quantity_in)} / -{formatNumber(count.quantity_out)}
                </span>
              </dd>
            </div>
          </dl>
          {count.adjustment_number && (
            <p className="mt-3">
              {t('stock.counts.sheet.adjustment', { number: count.adjustment_number })}
            </p>
          )}
        </Card>
      )}

      {open && (
        <Card className="mb-4 space-y-2 p-4">
          <form onSubmit={(e) => void scan(e)} className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1">
              <span className="type-label mb-1 block">{t('stock.counts.sheet.scan')}</span>
              <Input
                ref={scanRef}
                value={code}
                maxLength={100}
                ltr
                autoComplete="off"
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary" disabled={!code.trim()}>
              {t('stock.counts.sheet.scanButton')}
            </Button>
          </form>
          {scanNote && <Notice tone="success">{scanNote}</Notice>}
          <FormError message={scanError} />
          <p className="type-caption">{t('stock.counts.sheet.liveHint')}</p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_2fr] md:items-end">
        <Select
          label={t('stock.counts.sheet.filter')}
          value={filter}
          options={FILTERS.map((f) => ({ value: f, label: t(`stock.counts.sheet.filters.${f}`) }))}
          onChange={(e) => {
            setFilter(e.target.value as StockCountLineFilter);
            setPage(1);
          }}
        />
        <SearchInput
          value={searchInput}
          onValueChange={setSearchInput}
          label={t('stock.counts.sheet.search')}
          placeholder={t('stock.counts.sheet.search')}
        />
      </div>
      {open && edits.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button loading={busy} onClick={() => void save()}>
            {t('stock.counts.sheet.save')}
          </Button>
          <span className="type-caption">{t('stock.counts.sheet.unsaved')}</span>
        </div>
      )}
      <DataTable
        caption={t('stock.counts.sheet.title', { number: count?.number ?? '' })}
        columns={columns}
        data={count?.lines.items ?? []}
        loading={detail.isPending}
        error={detail.isError}
        onRetry={() => void detail.refetch()}
        getRowId={(l) => l.id}
        empty={{ title: t('stock.counts.sheet.empty') }}
        server={{
          page,
          pageSize: PAGE_SIZE,
          total: count?.lines.total ?? 0,
          onPageChange: setPage,
        }}
      />

      {posting && count && (
        <PostDialog
          id={id}
          number={count.number}
          quantityIn={count.quantity_in}
          quantityOut={count.quantity_out}
          uncounted={uncounted}
          onClose={() => setPosting(false)}
          onPosted={() => void refresh()}
        />
      )}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('stock.counts.sheet.cancelTitle', { number: count?.number ?? '' })}
        description={t('stock.counts.sheet.cancelHelp')}
        confirmLabel={t('stock.counts.sheet.cancelConfirm')}
        cancelLabel={t('stock.counts.sheet.keep')}
        tone="danger"
        loading={busy}
        onConfirm={() => {
          setBusy(true);
          stockApi
            .cancelCount(id)
            .then(async () => {
              notify.success(t('stock.counts.sheet.cancelled'));
              setCancelling(false);
              setEdits(new Map());
              await refresh();
            })
            .catch((err: unknown) => notify.error(countError(err)))
            .finally(() => setBusy(false));
        }}
      />
    </PageContainer>
  );
}

/** Mounted per opening, so a retried post reuses the same idempotency key. */
function PostDialog({
  id,
  number,
  quantityIn,
  quantityOut,
  uncounted,
  onClose,
  onPosted,
}: {
  id: string;
  number: string;
  quantityIn: number;
  quantityOut: number;
  uncounted: number;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const [asZero, setAsZero] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function post() {
    setError('');
    setSaving(true);
    try {
      const posted = await stockApi.postCount(id, asZero, key);
      notify.success(
        t(posted.adjustment_id ? 'stock.counts.sheet.posted' : 'stock.counts.sheet.postedNoChange'),
      );
      onPosted();
      onClose();
    } catch (err) {
      setError(countError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.counts.sheet.postTitle', { number })}
      description={t('stock.counts.sheet.postHelp', {
        in: formatNumber(quantityIn),
        out: formatNumber(quantityOut),
      })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('stock.counts.sheet.keep')}
          </Button>
          <Button loading={saving} disabled={uncounted > 0 && !asZero} onClick={() => void post()}>
            {t('stock.counts.sheet.post')}
          </Button>
        </>
      }
    >
      {uncounted > 0 && (
        <div className="space-y-2">
          <Notice tone="info">{t('stock.counts.sheet.uncounted', { count: uncounted })}</Notice>
          <Checkbox
            label={t('stock.counts.sheet.uncountedAsZero')}
            checked={asZero}
            onChange={(e) => setAsZero(e.target.checked)}
          />
        </div>
      )}
      <FormError message={error} />
    </Dialog>
  );
}
