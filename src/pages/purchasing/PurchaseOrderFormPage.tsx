import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PurchaseOrderCreateBody,
  PurchaseOrderUpdateBody,
  Uuid,
  type PurchaseOrder,
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
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { ApiError } from '@/lib/api';
import { padDecimals } from '@/lib/number';
import { productKeys, productsApi } from '@/services/productsApi';
import { purchaseOrderKeys, purchaseOrdersApi } from '@/services/purchaseOrdersApi';
import { stockApi, stockKeys } from '@/services/stockApi';
import { supplierKeys, suppliersApi } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { orderError } from './purchaseOrderShared';
import { productName } from './purchaseShared';

interface Line {
  product_id: string;
  name: string;
  sku: string;
  quantity: string;
  expected_unit_cost: string;
}

const uuidOrEmpty = (v: string | null) => (v && Uuid.safeParse(v).success ? v : '');
const LOW_PARAMS = (branchId: string) => ({ low_only: true, branch_id: branchId, pageSize: 100 });

/**
 * /purchasing/orders/new and /purchasing/orders/:id/edit (drafts only). With
 * `?branch_id=<uuid>&from=low` the new form starts with every product below its minimum in that
 * branch, quantity = minimum − available (D52).
 */
export default function PurchaseOrderFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const orgId = useAuthStore((s) => s.orgId);
  const editing = id !== undefined;
  const validId = !editing || Uuid.safeParse(id).success;
  // A branch from the URL is used only when it is a UUID.
  const urlBranch = editing ? '' : uuidOrEmpty(search.get('branch_id'));
  const fromLow = urlBranch !== '' && search.get('from') === 'low';
  const order = useQuery({
    queryKey: purchaseOrderKeys.one(orgId, id ?? ''),
    queryFn: () => purchaseOrdersApi.get(id!),
    enabled: editing && validId,
  });
  const low = useQuery({
    queryKey: stockKeys.list(orgId, LOW_PARAMS(urlBranch)),
    queryFn: () => stockApi.list(LOW_PARAMS(urlBranch)),
    enabled: fromLow,
  });

  if (!validId || (order.error instanceof ApiError && order.error.status === 404)) {
    return (
      <PageContainer>
        <EmptyState
          role="alert"
          title={t('purchases.orders.detail.notFound')}
          description={t('purchases.orders.detail.notFoundHint')}
          action={
            <Link to="/purchasing/orders" className="btn btn-secondary">
              {t('purchases.orders.back')}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  if (editing && order.isError) {
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.orders.detail.loadFailed')}
          onRetry={() => void order.refetch()}
        />
      </PageContainer>
    );
  }
  if ((editing && !order.data) || (fromLow && low.isPending)) return <LoadingState />;
  if (order.data && order.data.status !== 'draft') {
    return (
      <PageContainer>
        <EmptyState
          title={t('purchases.orders.detail.notEditable')}
          action={
            <Link to={`/purchasing/orders/${order.data.id}`} className="btn btn-secondary">
              {t('purchases.orders.detail.title', { number: order.data.number })}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  const lowLines: Line[] | undefined = fromLow
    ? (low.data?.items ?? [])
        .filter((r) => r.min_level - r.available > 0)
        .map((r) => ({
          product_id: r.product_id,
          name: productName(r),
          sku: r.sku,
          quantity: String(r.min_level - r.available),
          expected_unit_cost: '',
        }))
    : undefined;
  return <PurchaseOrderForm order={order.data} branchId={urlBranch} lowLines={lowLines} />;
}

function PurchaseOrderForm({
  order,
  branchId: urlBranch,
  lowLines,
}: {
  order?: PurchaseOrder | undefined;
  branchId: string;
  lowLines?: Line[] | undefined;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const branches = useBranches();
  // One key per form: a double submit saves the same order once.
  const [key] = useState(() => crypto.randomUUID());
  const saving = useRef(false);
  const [supplierId, setSupplierId] = useState(order?.supplier_id ?? '');
  const [pickedBranch, setPickedBranch] = useState(order?.branch_id ?? urlBranch);
  const [expectedDate, setExpectedDate] = useState(order?.expected_date ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    order
      ? order.lines.map((l) => ({
          product_id: l.product_id,
          name: productName(l),
          sku: l.sku,
          quantity: String(l.quantity),
          expected_unit_cost: l.expected_unit_cost ?? '',
        }))
      : (lowLines ?? []),
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const suppliers = useQuery({
    queryKey: supplierKeys.list(orgId, { status: 'active', pageSize: 100 }),
    queryFn: () => suppliersApi.list({ status: 'active', pageSize: 100 }),
    enabled: !order,
  });
  const listParams = { ...(search ? { search } : {}), status: 'active' as const, pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
    enabled: search.length > 0,
  });

  const myBranches = branches.data ?? [];
  // The caller's first branch is the default once the list is in.
  const branchId = pickedBranch || myBranches[0]?.id || '';
  const update = (productId: string, patch: Partial<Line>) =>
    setLines((list) => list.map((l) => (l.product_id === productId ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    setError('');
    if (!supplierId || !branchId) {
      setError(t('purchases.orders.form.chooseBoth'));
      return;
    }
    if (lines.length === 0) {
      setError(t('purchases.orders.form.noLines'));
      return;
    }
    const header = {
      expected_date: expectedDate || null,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity || '0'),
        ...(l.expected_unit_cost
          ? { expected_unit_cost: padDecimals(l.expected_unit_cost, 2) }
          : {}),
      })),
    };
    const parsed = order
      ? PurchaseOrderUpdateBody.safeParse(header)
      : PurchaseOrderCreateBody.safeParse({
          supplier_id: supplierId,
          branch_id: branchId,
          ...header,
        });
    if (!parsed.success) {
      setError(t('purchases.errors.validation'));
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const saved = order
        ? await purchaseOrdersApi.update(order.id, parsed.data as PurchaseOrderUpdateBody)
        : await purchaseOrdersApi.create(parsed.data as PurchaseOrderCreateBody, key);
      notify.success(t('purchases.orders.form.saved', { number: saved.number }));
      await cache.invalidateQueries({ queryKey: purchaseOrderKeys.all(orgId) });
      void navigate(`/purchasing/orders/${saved.id}`);
    } catch (err) {
      setError(orderError(err));
      // A refused call can be tried again; after a success the form stays locked until it leaves.
      saving.current = false;
      setBusy(false);
    }
  }

  const supplierOptions = order
    ? [{ value: order.supplier_id, label: order.supplier_name }]
    : (suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }));
  const back = order ? `/purchasing/orders/${order.id}` : '/purchasing/orders';

  return (
    <PageContainer>
      <PageHeader
        title={
          order
            ? t('purchases.orders.form.editTitle', { number: order.number })
            : t('purchases.orders.form.newTitle')
        }
        description={t('purchases.orders.form.help')}
        actions={
          <Link to={back} className="btn btn-ghost">
            {t('purchases.orders.form.cancel')}
          </Link>
        }
      />
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        {lowLines && (
          <Notice tone="info">
            {t(
              lowLines.length > 0
                ? 'purchases.orders.form.lowLoaded'
                : 'purchases.orders.form.lowNone',
            )}
          </Notice>
        )}
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label={t('purchases.orders.form.supplier')}
              value={supplierId}
              disabled={!!order}
              {...(order ? {} : { placeholder: t('purchases.orders.form.chooseSupplier') })}
              options={supplierOptions}
              onChange={(e) => setSupplierId(e.target.value)}
            />
            <Select
              label={t('purchases.orders.form.branch')}
              value={branchId}
              disabled={!!order}
              options={myBranches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(e) => setPickedBranch(e.target.value)}
            />
            <FormField
              type="date"
              ltr
              label={t('purchases.orders.form.expectedDate')}
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
            <Textarea
              label={t('purchases.orders.form.notes')}
              value={notes}
              maxLength={1000}
              rows={1}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <SearchInput
              value={searchInput}
              onValueChange={setSearchInput}
              label={t('purchases.orders.form.search')}
              placeholder={t('purchases.orders.form.search')}
            />
            {search && results.data?.items.length === 0 && (
              <p className="type-caption">{t('purchases.orders.form.noResults')}</p>
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
                        onClick={() =>
                          setLines((list) => [
                            ...list,
                            {
                              product_id: p.id,
                              name: productName(p),
                              sku: p.sku,
                              quantity: '1',
                              expected_unit_cost: '',
                            },
                          ])
                        }
                      >
                        {t(added ? 'purchases.orders.form.added' : 'purchases.orders.form.add')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <h2 className="type-label mb-2 mt-4">{t('purchases.orders.form.lines')}</h2>
          {lines.length === 0 ? (
            <p className="type-caption">{t('purchases.orders.form.noLines')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <caption className="sr-only">{t('purchases.orders.form.lines')}</caption>
                <thead>
                  <tr>
                    <th className="type-label py-2 text-start">
                      {t('purchases.orders.form.product')}
                    </th>
                    <th className="type-label py-2 text-start">
                      {t('purchases.orders.form.quantity')}
                    </th>
                    <th className="type-label py-2 text-start">
                      {t('purchases.orders.form.expectedCost')}
                    </th>
                    <th className="sr-only">{t('purchases.orders.form.remove')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.product_id} className="border-t border-line align-top">
                      <td className="py-2 pe-3">
                        <span className="block">{line.name}</span>
                        <span className="type-caption block" dir="ltr">
                          {line.sku}
                        </span>
                      </td>
                      <td className="py-2 pe-3">
                        <NumberInput
                          label={t('purchases.orders.form.quantityFor', { name: line.name })}
                          value={line.quantity}
                          onValueChange={(v) => update(line.product_id, { quantity: v })}
                        />
                      </td>
                      <td className="py-2 pe-3">
                        <MoneyInput
                          label={t('purchases.orders.form.expectedCostFor', { name: line.name })}
                          value={line.expected_unit_cost}
                          onValueChange={(v) => update(line.product_id, { expected_unit_cost: v })}
                        />
                      </td>
                      <td className="py-2 text-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={t('purchases.orders.form.removeLine', { name: line.name })}
                          onClick={() =>
                            setLines((list) => list.filter((l) => l.product_id !== line.product_id))
                          }
                        >
                          {t('purchases.orders.form.remove')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <FormError message={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={busy} disabled={busy}>
            {t('purchases.orders.form.save')}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
