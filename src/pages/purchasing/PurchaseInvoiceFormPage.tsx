import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PurchaseInvoiceCreateBody,
  PurchaseInvoiceUpdateBody,
  Uuid,
  type Product,
  type PurchaseInvoice,
  type TaxClass,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import LoadingState from '@/components/ui/LoadingState';
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { padDecimals } from '@/lib/number';
import { productKeys, productsApi } from '@/services/productsApi';
import { purchaseInvoiceKeys, purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { taxClassKeys, taxClassesApi } from '@/services/taxClassesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import {
  lineTotals,
  liveTotals,
  parseSerials,
  productName,
  purchaseError,
  shopToday,
  takenSerials,
} from './purchaseShared';

interface Line {
  product_id: string;
  name: string;
  sku: string;
  is_serialized: boolean;
  tax_class_id: string;
  quantity: string;
  unit_cost: string;
  /** One serial per text line. */
  serials: string;
}

const lineOf = (product: Product): Line => ({
  product_id: product.id,
  name: productName(product),
  sku: product.sku,
  is_serialized: product.is_serialized,
  tax_class_id: product.tax_class_id,
  quantity: '1',
  unit_cost: '',
  serials: '',
});

/** /purchasing/invoices/new and /purchasing/invoices/:id/edit (drafts only). */
export default function PurchaseInvoiceFormPage() {
  const { id } = useParams();
  const orgId = useAuthStore((s) => s.orgId);
  const editing = id !== undefined;
  const validId = !editing || Uuid.safeParse(id).success;
  const invoice = useQuery({
    queryKey: purchaseInvoiceKeys.one(orgId, id ?? ''),
    queryFn: () => purchaseInvoicesApi.get(id!),
    enabled: editing && validId,
  });

  if (!validId || (invoice.error instanceof ApiError && invoice.error.status === 404)) {
    return (
      <PageContainer>
        <EmptyState
          role="alert"
          title={t('purchases.detail.notFound')}
          description={t('purchases.detail.notFoundHint')}
          action={
            <Link to="/purchasing/invoices" className="btn btn-secondary">
              {t('purchases.back')}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  if (editing && invoice.isError) {
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.detail.loadFailed')}
          onRetry={() => void invoice.refetch()}
        />
      </PageContainer>
    );
  }
  if (editing && !invoice.data) return <LoadingState />;
  if (invoice.data && invoice.data.status !== 'draft') {
    return (
      <PageContainer>
        <EmptyState
          title={t('purchases.detail.notEditable')}
          action={
            <Link to={`/purchasing/invoices/${invoice.data.id}`} className="btn btn-secondary">
              {t('purchases.detail.title', { number: invoice.data.number })}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  return <PurchaseInvoiceForm invoice={invoice.data} />;
}

function PurchaseInvoiceForm({ invoice }: { invoice?: PurchaseInvoice | undefined }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const branches = useBranches();
  // One key per form: a double submit posts the same invoice once.
  const [key] = useState(() => crypto.randomUUID());
  const [supplierId, setSupplierId] = useState(invoice?.supplier_id ?? '');
  const [branchId, setBranchId] = useState(invoice?.branch_id ?? '');
  const [supplierNo, setSupplierNo] = useState(invoice?.supplier_invoice_no ?? '');
  const [date, setDate] = useState(invoice?.invoice_date ?? shopToday());
  const [lines, setLines] = useState<Line[]>(
    (invoice?.lines ?? []).map((l) => ({
      product_id: l.product_id,
      name: productName(l),
      sku: l.sku,
      is_serialized: l.is_serialized,
      tax_class_id: l.tax_class_id,
      quantity: String(l.quantity),
      unit_cost: l.unit_cost,
      serials: (l.serials ?? []).join('\n'),
    })),
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [noError, setNoError] = useState('');
  const [badLines, setBadLines] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const suppliers = useQuery({
    queryKey: supplierKeys.list(orgId, { status: 'active', pageSize: 100 }),
    queryFn: () => suppliersApi.list({ status: 'active', pageSize: 100 }),
    enabled: !invoice,
  });
  const taxClasses = useQuery({ queryKey: taxClassKeys.list(orgId), queryFn: taxClassesApi.list });
  const listParams = { ...(search ? { search } : {}), status: 'active' as const, pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
    enabled: search.length > 0,
  });

  // The caller's branch is the default once the list is in.
  const myBranches = branches.data ?? [];
  if (!branchId && !invoice && myBranches[0]) setBranchId(myBranches[0].id);

  const classes: TaxClass[] = taxClasses.data ?? [];
  const rateOf = (classId: string) => classes.find((c) => c.id === classId)?.rate ?? '0';
  const costLines = lines.map((l) => ({
    quantity: l.quantity,
    unit_cost: l.unit_cost,
    tax_rate: rateOf(l.tax_class_id),
  }));
  const totals = liveTotals(costLines);
  const update = (productId: string, patch: Partial<Line>) =>
    setLines((list) => list.map((l) => (l.product_id === productId ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNoError('');
    setBadLines({});
    if (!supplierId || !branchId) {
      setError(t('purchases.form.chooseBoth'));
      return;
    }
    if (lines.length === 0) {
      setError(t('purchases.form.noLines'));
      return;
    }
    const bodyLines = lines.map((l) => {
      const serials = parseSerials(l.serials);
      return {
        product_id: l.product_id,
        quantity: Number(l.quantity || '0'),
        unit_cost: padDecimals(l.unit_cost, 2),
        tax_class_id: l.tax_class_id,
        ...(l.is_serialized && serials.length > 0 ? { serials } : {}),
      };
    });
    const wrongCount = Object.fromEntries(
      lines
        .filter((l) => {
          const n = parseSerials(l.serials).length;
          return l.is_serialized && n > 0 && n !== Number(l.quantity || '0');
        })
        .map((l) => [
          l.product_id,
          t('purchases.form.serialsCount', {
            entered: parseSerials(l.serials).length,
            needed: l.quantity || '0',
          }),
        ]),
    );
    if (Object.keys(wrongCount).length > 0) {
      setBadLines(wrongCount);
      setError(t('purchases.errors.validation'));
      return;
    }
    const header = {
      supplier_invoice_no: supplierNo.trim() || null,
      invoice_date: date,
      lines: bodyLines,
    };
    const parsed = invoice
      ? PurchaseInvoiceUpdateBody.safeParse(header)
      : PurchaseInvoiceCreateBody.safeParse({
          supplier_id: supplierId,
          branch_id: branchId,
          ...header,
          supplier_invoice_no: header.supplier_invoice_no ?? undefined,
        });
    if (!parsed.success) {
      setError(t('purchases.errors.validation'));
      return;
    }
    setSaving(true);
    try {
      const saved = invoice
        ? await purchaseInvoicesApi.update(invoice.id, parsed.data as PurchaseInvoiceUpdateBody)
        : await purchaseInvoicesApi.create(parsed.data as PurchaseInvoiceCreateBody, key);
      notify.success(t('purchases.form.saved', { number: saved.number }));
      await cache.invalidateQueries({ queryKey: purchaseInvoiceKeys.all(orgId) });
      void navigate(`/purchasing/invoices/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SUPPLIER_INVOICE_NO_TAKEN') {
        setNoError(t('purchases.errors.supplierInvoiceNoTaken'));
      } else {
        const taken = takenSerials(err);
        if (taken.length > 0) {
          setBadLines(
            Object.fromEntries(
              lines
                .filter((l) => parseSerials(l.serials).some((s) => taken.includes(s)))
                .map((l) => [l.product_id, purchaseError(err)]),
            ),
          );
        }
        setError(purchaseError(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const supplierOptions = invoice
    ? [{ value: invoice.supplier_id, label: invoice.supplier_name }]
    : [
        { value: '', label: t('purchases.form.chooseSupplier') },
        ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      ];

  return (
    <PageContainer>
      <PageHeader
        title={
          invoice
            ? t('purchases.form.editTitle', { number: invoice.number })
            : t('purchases.form.newTitle')
        }
        description={t('purchases.form.help')}
        actions={
          <Link
            to={invoice ? `/purchasing/invoices/${invoice.id}` : '/purchasing/invoices'}
            className="btn btn-ghost"
          >
            {t('purchases.form.cancel')}
          </Link>
        }
      />
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label={t('purchases.form.supplier')}
              value={supplierId}
              disabled={!!invoice}
              options={supplierOptions}
              onChange={(e) => setSupplierId(e.target.value)}
            />
            <Select
              label={t('purchases.form.branch')}
              value={branchId}
              disabled={!!invoice}
              options={myBranches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(e) => setBranchId(e.target.value)}
            />
            <FormField
              label={t('purchases.form.supplierInvoiceNo')}
              ltr
              maxLength={40}
              value={supplierNo}
              error={noError}
              onChange={(e) => setSupplierNo(e.target.value)}
            />
            <FormField
              type="date"
              ltr
              label={t('purchases.form.date')}
              value={date}
              max={shopToday()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              label={t('purchases.form.search')}
              placeholder={t('purchases.form.search')}
            />
            {search && results.data?.items.length === 0 && (
              <p className="type-caption">{t('purchases.form.noResults')}</p>
            )}
            {search && (results.data?.items.length ?? 0) > 0 && (
              <ul className="divide-y divide-line rounded-control border border-line">
                {(results.data?.items ?? []).map((p) => {
                  const added = lines.some((l) => l.product_id === p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{productName(p)}</span>
                        <span className="type-caption block" dir="ltr">
                          {p.sku}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={added}
                        onClick={() => setLines((list) => [...list, lineOf(p)])}
                      >
                        {t(added ? 'purchases.form.added' : 'purchases.form.add')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <h2 className="type-label mb-2 mt-4">{t('purchases.form.lines')}</h2>
          {lines.length === 0 ? (
            <p className="type-caption">{t('purchases.form.noLines')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <caption className="sr-only">{t('purchases.form.lines')}</caption>
                <thead>
                  <tr>
                    <th className="type-label py-2 text-start">{t('purchases.form.product')}</th>
                    <th className="type-label py-2 text-start">{t('purchases.form.quantity')}</th>
                    <th className="type-label py-2 text-start">{t('purchases.form.unitCost')}</th>
                    <th className="type-label py-2 text-start">{t('purchases.form.taxClass')}</th>
                    <th className="type-label px-2 py-2 text-end">{t('purchases.form.net')}</th>
                    <th className="type-label px-2 py-2 text-end">{t('purchases.form.vat')}</th>
                    <th className="type-label px-2 py-2 text-end">
                      {t('purchases.form.lineTotal')}
                    </th>
                    <th className="sr-only">{t('purchases.form.remove')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <LineRow
                      key={line.product_id}
                      line={line}
                      classes={classes}
                      rate={rateOf(line.tax_class_id)}
                      error={badLines[line.product_id]}
                      onChange={(patch) => update(line.product_id, patch)}
                      onRemove={() =>
                        setLines((list) => list.filter((l) => l.product_id !== line.product_id))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totals && (
            <dl className="mt-4 grid gap-1 sm:ms-auto sm:w-72">
              <div className="flex justify-between">
                <dt>{t('purchases.form.subtotal')}</dt>
                <dd className="num" data-testid="doc-subtotal">
                  {formatMoney(totals.net_total)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('purchases.form.taxTotal')}</dt>
                <dd className="num" data-testid="doc-tax">
                  {formatMoney(totals.tax_total)}
                </dd>
              </div>
              <div className="type-section-title flex justify-between">
                <dt>{t('purchases.form.total')}</dt>
                <dd className="num" data-testid="doc-total">
                  {formatMoney(totals.total)}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={saving}>
            {t('purchases.form.save')}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}

/** One editable line (a row component, so inputs keep their focus while typing). */
function LineRow({
  line,
  classes,
  rate,
  error,
  onChange,
  onRemove,
}: {
  line: Line;
  classes: TaxClass[];
  rate: string;
  error: string | undefined;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const result = lineTotals({ quantity: line.quantity, unit_cost: line.unit_cost, tax_rate: rate });
  const serialCount = parseSerials(line.serials).length;
  const classOptions = classes
    .filter((c) => !c.archived_at || c.id === line.tax_class_id)
    .map((c) => ({ value: c.id, label: c.name }));
  return (
    <>
      <tr className={`border-t border-line align-top ${error ? 'bg-danger-50' : ''}`}>
        <td className="py-2 pe-2">
          <span className="block">{line.name}</span>
          <span className="type-caption block" dir="ltr">
            {line.sku}
          </span>
        </td>
        <td className="w-28 py-2 pe-2 [&_.field-label]:sr-only">
          <NumberInput
            label={`${t('purchases.form.quantity')}: ${line.name}`}
            value={line.quantity}
            decimals={0}
            maxLength={6}
            onValueChange={(quantity) => onChange({ quantity })}
          />
        </td>
        <td className="w-40 py-2 pe-2 [&_.field-label]:sr-only">
          <MoneyInput
            label={`${t('purchases.form.unitCost')}: ${line.name}`}
            value={line.unit_cost}
            onValueChange={(unit_cost) => onChange({ unit_cost })}
          />
        </td>
        <td className="w-52 py-2 pe-2 [&_.field-label]:sr-only">
          <Select
            label={`${t('purchases.form.taxClass')}: ${line.name}`}
            value={line.tax_class_id}
            options={classOptions}
            onChange={(e) => onChange({ tax_class_id: e.target.value })}
          />
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-end">
          <span className="num" data-testid={`net-${line.product_id}`}>
            {result ? formatMoney(result.net) : ''}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-end">
          <span className="num" data-testid={`vat-${line.product_id}`}>
            {result ? formatMoney(result.tax) : ''}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-end">
          <span className="num" data-testid={`total-${line.product_id}`}>
            {result ? formatMoney(result.gross) : ''}
          </span>
        </td>
        <td className="py-2 text-end">
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            {t('purchases.form.remove')}
          </Button>
        </td>
      </tr>
      {line.is_serialized && (
        <tr>
          <td colSpan={8} className="pb-3">
            <Textarea
              label={`${t('purchases.form.serials')}: ${line.name}`}
              dir="ltr"
              rows={Math.min(Math.max(Number(line.quantity) || 1, 2), 6)}
              value={line.serials}
              help={
                serialCount === 0
                  ? t('purchases.form.serialsLater')
                  : t('purchases.form.serialsCount', {
                      entered: serialCount,
                      needed: line.quantity || '0',
                    })
              }
              error={error}
              onChange={(e) => onChange({ serials: e.target.value })}
            />
          </td>
        </tr>
      )}
      {!line.is_serialized && error && (
        <tr>
          <td colSpan={8} className="pb-2 text-danger-600" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
