import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Product, ProductUnit, Shift } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import Dialog from '@/components/ui/Dialog';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import SearchInput from '@/components/ui/SearchInput';
import Skeleton from '@/components/ui/Skeleton';
import Can from '@/features/me/Can';
import { formatMoney, formatNumber } from '@/lib/format';
import { productKeys, productsApi } from '@/services/productsApi';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { saleError } from './saleShared';
import { productName, usePosCart } from './usePosCart';

const th = 'type-label py-2 text-start';
const thNum = 'type-label py-2 text-end';
const tdNum = 'type-body whitespace-nowrap py-2 text-end';

/**
 * S01: the smallest screen that sells. The cashier finds products, the server prices the cart
 * after every change, and Confirm sells it for cash in the open shift. S06 turns this into the
 * full POS (scanner, shortcuts, held carts); S02 adds the payment dialog.
 */
export default function PosPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const current = useQuery({ queryKey: shiftKeys.current(orgId), queryFn: shiftsApi.current });

  return (
    <PageContainer>
      <PageHeader title={t('sales.pos.title')} description={t('sales.pos.description')} />
      {current.isPending ? (
        <Skeleton className="h-40" />
      ) : current.isError ? (
        <ErrorState title={t('sales.errors.failed')} onRetry={() => void current.refetch()} />
      ) : !current.data ? (
        <Card>
          <div className="space-y-3">
            <Notice tone="info">{t('sales.pos.noShift')}</Notice>
            <Link to="/accounting/shifts" className="btn btn-primary">
              {t('sales.pos.noShiftAction')}
            </Link>
          </div>
        </Card>
      ) : (
        <Sell shift={current.data} />
      )}
    </PageContainer>
  );
}

function Sell({ shift }: { shift: Shift }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cart = usePosCart(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [unitsFor, setUnitsFor] = useState<Product | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);
  const listParams = { ...(search ? { search } : {}), status: 'active' as const, pageSize: 8 };
  const results = useQuery({
    queryKey: productKeys.list(orgId, listParams),
    queryFn: () => productsApi.list(listParams),
    placeholderData: keepPreviousData,
    enabled: search.length > 0,
  });
  const units = useQuery({
    queryKey: [...productKeys.units(orgId, unitsFor?.id ?? ''), 'in_stock'],
    queryFn: () => productsApi.units(unitsFor!.id, 'in_stock'),
    enabled: !!unitsFor,
  });
  // A unit is sold from the branch of the shift, once.
  const unitChoices: ProductUnit[] = (units.data ?? []).filter(
    (u) => u.branch_id === shift.branch_id && !cart.lines.some((l) => l.unit_id === u.id),
  );

  function add(product: Product) {
    setError('');
    if (product.is_serialized) {
      setPicked(new Set());
      setUnitsFor(product);
    } else {
      cart.addProduct(product);
    }
  }
  function addUnits() {
    if (!unitsFor) return;
    cart.addUnits(
      unitsFor,
      unitChoices.filter((u) => picked.has(u.id)),
    );
    setUnitsFor(null);
  }
  async function confirm() {
    setError('');
    const refused = await cart.confirm();
    if (refused) setError(saleError(refused));
  }

  if (cart.done) {
    return (
      <Card>
        <div className="space-y-3" role="status">
          <h2 className="type-section-title">
            {t('sales.pos.done.title', { number: cart.done.number })}
          </h2>
          <p className="type-body" data-testid="sale-paid">
            {t('sales.pos.done.total', { amount: formatMoney(cart.done.total) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={cart.reset}>{t('sales.pos.done.newSale')}</Button>
            <Link to={`/sales/${cart.done.id}`} className="btn btn-secondary">
              {t('sales.pos.done.view')}
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const quote = cart.quote;
  const over = (index: number) => {
    const q = quote?.lines[index];
    return cart.current && q !== undefined && q.quantity > q.available ? q.available : null;
  };
  const anyOver = cart.lines.some((_, i) => over(i) !== null);

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-2">
          <p className="type-caption">
            <span dir="ltr">{t('sales.pos.shift', { number: shift.number })}</span>
          </p>
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            label={t('sales.pos.search')}
            placeholder={t('sales.pos.search')}
          />
          {search && results.data?.items.length === 0 && (
            <p className="type-caption">{t('sales.pos.noResults')}</p>
          )}
          {search && (results.data?.items.length ?? 0) > 0 && (
            <ul className="divide-y divide-line rounded-card border border-line">
              {(results.data?.items ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate" dir="auto">
                      {productName(p)}
                    </span>
                    <span className="type-caption block" dir="ltr">
                      {p.sku}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="num type-body">{formatMoney(p.cash_price)}</span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => add(p)}>
                      {t(p.is_serialized ? 'sales.pos.chooseUnit' : 'sales.pos.add')}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title={t('sales.pos.cart')}>
        {cart.lines.length === 0 ? (
          <p className="type-caption">{t('sales.pos.emptyCart')}</p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start">
                <caption className="sr-only">{t('sales.pos.cart')}</caption>
                <thead>
                  <tr>
                    <th className={th}>{t('sales.pos.product')}</th>
                    <th className={th}>{t('sales.pos.quantity')}</th>
                    <th className={thNum}>{t('sales.pos.unitPrice')}</th>
                    <th className={thNum}>{t('sales.pos.vat')}</th>
                    <th className={thNum}>{t('sales.pos.lineTotal')}</th>
                    <th className="sr-only">{t('sales.pos.remove')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.lines.map((line, i) => {
                    const q = quote?.lines[i];
                    const available = over(i);
                    return (
                      <tr key={line.key} className="border-t border-line align-top">
                        <td className="py-2">
                          <span className="block" dir="auto">
                            {line.name}
                          </span>
                          <span className="type-caption block" dir="ltr">
                            {line.serial ?? line.sku}
                          </span>
                          {available !== null && (
                            <Badge tone="danger">
                              {t('sales.pos.onlyAvailable', { count: formatNumber(available) })}
                            </Badge>
                          )}
                          {q?.overridden && (
                            <Badge tone="warning">
                              {t('sales.pos.overridden', { price: formatMoney(q.list_price) })}
                            </Badge>
                          )}
                        </td>
                        <td className="w-28 py-2 [&_.field-label]:sr-only">
                          {line.unit_id ? (
                            '1'
                          ) : (
                            <NumberInput
                              label={t('sales.pos.quantityOf', { name: line.name })}
                              value={line.quantity}
                              decimals={0}
                              maxLength={6}
                              onValueChange={(v) => cart.setQuantity(line.key, v)}
                            />
                          )}
                        </td>
                        <td className={`${tdNum} [&_.field-label]:sr-only`}>
                          <span className="block">{q ? formatMoney(q.unit_price) : ''}</span>
                          <Can permission="price.override">
                            <span className="mt-1 block w-36 ms-auto">
                              <MoneyInput
                                label={t('sales.pos.priceOf', { name: line.name })}
                                value={line.price}
                                onValueChange={(v) => cart.setPrice(line.key, v)}
                              />
                            </span>
                          </Can>
                        </td>
                        <td className={tdNum}>{q ? formatMoney(q.tax_amount) : ''}</td>
                        <td className={tdNum}>{q ? formatMoney(q.line_total) : ''}</td>
                        <td className="py-2 text-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t('sales.pos.removeOf', { name: line.name })}
                            onClick={() => cart.remove(line.key)}
                          >
                            {t('sales.pos.remove')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <dl className="ms-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1">
              <dt className="type-caption">{t('sales.pos.subtotal')}</dt>
              <dd className="num text-end">{quote ? formatMoney(quote.subtotal) : ''}</dd>
              <dt className="type-caption">{t('sales.pos.vatTotal')}</dt>
              <dd className="num text-end">{quote ? formatMoney(quote.tax_total) : ''}</dd>
              <dt className="type-label">{t('sales.pos.total')}</dt>
              <dd className="num type-section-title text-end" data-testid="sale-total">
                {quote ? formatMoney(quote.total) : ''}
              </dd>
            </dl>
            <p className="type-caption">
              {cart.quoting
                ? t('sales.pos.quoting')
                : quote
                  ? t(quote.prices_include_vat ? 'sales.pos.vatIncluded' : 'sales.pos.vatAdded')
                  : ''}
            </p>
            <FormError message={error || (cart.quoteError ? saleError(cart.quoteError) : '')} />
            <div className="flex justify-end">
              <Button
                loading={cart.busy}
                disabled={cart.busy || !cart.current || anyOver}
                onClick={() => void confirm()}
              >
                {t('sales.pos.confirm')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={!!unitsFor}
        onOpenChange={(v) => !v && setUnitsFor(null)}
        title={t('sales.pos.unitsTitle', { name: unitsFor ? productName(unitsFor) : '' })}
        description={t('sales.pos.unitsHelp')}
      >
        <div className="space-y-3">
          {units.isError && <p role="alert">{t('sales.pos.unitsFailed')}</p>}
          {units.data && unitChoices.length === 0 && (
            <p className="type-caption">{t('sales.pos.noUnits')}</p>
          )}
          {unitChoices.map((u) => (
            <Checkbox
              key={u.id}
              label={<span dir="ltr">{u.serial}</span>}
              checked={picked.has(u.id)}
              onChange={(e) =>
                setPicked((set) => {
                  const next = new Set(set);
                  if (e.target.checked) next.add(u.id);
                  else next.delete(u.id);
                  return next;
                })
              }
            />
          ))}
          <Button type="button" disabled={picked.size === 0} onClick={addUnits}>
            {t('sales.pos.addUnits')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
