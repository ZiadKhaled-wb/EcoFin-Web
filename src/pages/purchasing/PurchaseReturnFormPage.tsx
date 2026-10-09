import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PurchaseReturnCreateBody,
  Uuid,
  type PurchaseRefundMode,
  type ReturnableLine,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import NumberInput from '@/components/ui/NumberInput';
import RadioGroup from '@/components/ui/RadioGroup';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { cashKeys } from '@/services/cashApi';
import { purchaseInvoiceKeys, purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { purchaseReturnKeys, purchaseReturnsApi } from '@/services/purchaseReturnsApi';
import { stockKeys } from '@/services/stockApi';
import { supplierKeys } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { productName } from './purchaseShared';
import {
  qtyExceeded,
  returnError,
  returnTotals,
  returnedByLine,
  type ReturnPick,
} from './purchaseReturnShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start align-top';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end align-top';

function Refused({ title }: { title: string }) {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={title}
        action={
          <Link to="/purchasing/invoices" className="btn btn-secondary">
            {t('purchases.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * U04: send goods of an approved purchase invoice back to the supplier. Quantities are capped at
 * what can still go back; serialized lines pick their exact units; the refund is a supplier
 * credit or cash into a safe or bank. One idempotency key per form.
 */
export default function PurchaseReturnFormPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  // One key per form: a double submit posts the same return once.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<PurchaseRefundMode>('supplier_credit');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  const returnable = useQuery({
    queryKey: purchaseReturnKeys.returnable(orgId, id),
    queryFn: () => purchaseReturnsApi.returnable(id),
    enabled: validId,
  });
  const invoice = useQuery({
    queryKey: purchaseInvoiceKeys.one(orgId, id),
    queryFn: () => purchaseInvoicesApi.get(id),
    enabled: validId,
  });
  const prior = useQuery({
    queryKey: purchaseReturnKeys.prior(orgId, id),
    queryFn: () => purchaseReturnsApi.prior(id),
    enabled: validId,
  });
  const branchId = returnable.data?.invoice.branch_id ?? '';
  const accounts = useQuery({
    queryKey: purchaseReturnKeys.cashAccounts(orgId, branchId),
    queryFn: () => purchaseReturnsApi.cashAccounts(branchId),
    enabled: mode === 'cash' && branchId !== '',
  });

  if (!validId) return <Refused title={t('purchases.detail.notFound')} />;
  if (returnable.isError && !returnable.data) {
    if (returnable.error instanceof ApiError && returnable.error.status === 404)
      return <Refused title={t('purchases.detail.notFound')} />;
    return (
      <PageContainer>
        <ErrorState
          title={t('purchases.returns.form.loadFailed')}
          onRetry={() => void returnable.refetch()}
        />
      </PageContainer>
    );
  }
  const data = returnable.data;
  if (!data) return <LoadingState />;
  if (data.invoice.status !== 'approved')
    return <Refused title={t('purchases.returns.form.notApproved')} />;

  const back = `/purchasing/invoices/${data.invoice.id}`;
  const countOf = (l: ReturnableLine) =>
    l.is_serialized
      ? (units[l.invoice_line_id] ?? []).length
      : Number(quantities[l.invoice_line_id] || 0);
  const picks: ReturnPick[] = data.lines
    .map((l) => ({
      invoice_line_id: l.invoice_line_id,
      quantity: countOf(l),
      perUnit: l.is_serialized,
    }))
    .filter((p) => p.quantity > 0);
  const totals =
    invoice.data && prior.data
      ? returnTotals(invoice.data, returnedByLine(prior.data), picks)
      : null;

  /** The quantity never goes above what can still be returned. */
  function setQuantity(line: ReturnableLine, value: string) {
    const capped =
      value !== '' && Number(value) > line.returnable ? String(line.returnable) : value;
    setQuantities((q) => ({ ...q, [line.invoice_line_id]: capped }));
    setLineErrors((e) => ({ ...e, [line.invoice_line_id]: '' }));
  }
  function toggleUnit(line: ReturnableLine, unitId: string, on: boolean) {
    setUnits((u) => {
      const now = u[line.invoice_line_id] ?? [];
      return {
        ...u,
        [line.invoice_line_id]: on ? [...now, unitId] : now.filter((x) => x !== unitId),
      };
    });
    setLineErrors((e) => ({ ...e, [line.invoice_line_id]: '' }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (posting.current) return;
    setFormError('');
    setReasonError('');
    setAccountError('');
    const text = reason.trim();
    let ok = true;
    if (picks.length === 0) {
      setFormError(t('purchases.returns.errors.nothing'));
      ok = false;
    }
    if (text.length < 3 || text.length > 500) {
      setReasonError(t('purchases.returns.errors.reasonInvalid'));
      ok = false;
    }
    if (mode === 'cash' && !accountId) {
      setAccountError(t('purchases.returns.errors.accountRequired'));
      ok = false;
    }
    if (!ok) return;
    const parsed = PurchaseReturnCreateBody.safeParse({
      purchase_invoice_id: data!.invoice.id,
      refund_mode: mode,
      ...(mode === 'cash' ? { cash_account_id: accountId } : {}),
      reason: text,
      lines: data!.lines
        .filter((l) => countOf(l) > 0)
        .map((l) =>
          l.is_serialized
            ? { invoice_line_id: l.invoice_line_id, unit_ids: units[l.invoice_line_id] }
            : { invoice_line_id: l.invoice_line_id, quantity: countOf(l) },
        ),
    });
    if (!parsed.success) {
      setFormError(t('purchases.errors.validation'));
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      const posted = await purchaseReturnsApi.create(parsed.data, key);
      notify.success(t('purchases.returns.form.posted', { number: posted.number }));
      await Promise.all([
        cache.invalidateQueries({ queryKey: purchaseReturnKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: purchaseInvoiceKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: supplierKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: stockKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
      ]);
      navigate(`/purchasing/returns/${posted.id}`);
    } catch (err) {
      const exceeded = qtyExceeded(err);
      if (exceeded) {
        setLineErrors((le) => ({
          ...le,
          [exceeded.invoice_line_id]: t('purchases.returns.errors.qtyExceeded', {
            returnable: formatNumber(exceeded.returnable),
          }),
        }));
        void returnable.refetch();
      }
      setFormError(returnError(err));
      // A refused call can be tried again; after a success the form stays locked until it leaves.
      posting.current = false;
      setBusy(false);
    }
  }

  const nothingLeft = data.lines.every((l) => l.returnable === 0);
  const accountOptions = (accounts.data?.items ?? []).map((a) => ({
    value: a.id,
    label: `${a.name} (${formatMoney(a.balance)})`,
  }));

  return (
    <PageContainer>
      <PageHeader
        title={t('purchases.returns.form.title', { number: data.invoice.number })}
        description={t('purchases.returns.form.help')}
        actions={
          <Link to={back} className="btn btn-ghost">
            {t('purchases.returns.form.cancel')}
          </Link>
        }
      />
      <form className="space-y-4" noValidate onSubmit={(e) => void submit(e)}>
        {nothingLeft && <FormError message={t('purchases.returns.form.nothingLeft')} />}
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('purchases.returns.form.lines')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('purchases.returns.form.product')}</th>
                  <th className={thNum}>{t('purchases.returns.form.purchased')}</th>
                  <th className={thNum}>{t('purchases.returns.form.returned')}</th>
                  <th className={thNum}>{t('purchases.returns.form.returnable')}</th>
                  <th className={thNum}>{t('purchases.returns.form.unitCost')}</th>
                  <th className={th}>{t('purchases.returns.form.quantity')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => {
                  const name = productName(l);
                  const error = lineErrors[l.invoice_line_id];
                  return (
                    <tr key={l.invoice_line_id} className="border-b border-line">
                      <td className={td}>
                        <span className="block">{name}</span>
                        <span className="type-caption block" dir="ltr">
                          {l.sku}
                        </span>
                      </td>
                      <td className={tdNum}>{formatNumber(l.purchased)}</td>
                      <td className={tdNum}>{formatNumber(l.returned)}</td>
                      <td className={tdNum}>{formatNumber(l.returnable)}</td>
                      <td className={tdNum}>{formatMoney(l.unit_cost)}</td>
                      <td className={td}>
                        {l.is_serialized ? (
                          <fieldset>
                            <legend className="sr-only">
                              {t('purchases.returns.form.units')} {name}
                            </legend>
                            {l.units_in_stock.length === 0 && (
                              <p className="type-caption">{t('purchases.returns.form.noUnits')}</p>
                            )}
                            {l.units_in_stock.map((u) => (
                              <Checkbox
                                key={u.unit_id}
                                label={<span dir="ltr">{u.serial}</span>}
                                checked={(units[l.invoice_line_id] ?? []).includes(u.unit_id)}
                                onChange={(e) => toggleUnit(l, u.unit_id, e.target.checked)}
                              />
                            ))}
                            {error && <FormError message={error} />}
                          </fieldset>
                        ) : (
                          <NumberInput
                            label={t('purchases.returns.form.quantityFor', { name })}
                            value={quantities[l.invoice_line_id] ?? ''}
                            onValueChange={(v) => setQuantity(l, v)}
                            disabled={l.returnable === 0}
                            error={error}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <RadioGroup
                label={t('purchases.returns.form.refundMode')}
                name="refund_mode"
                value={mode}
                onChange={(v) => {
                  setMode(v === 'cash' ? 'cash' : 'supplier_credit');
                  setAccountError('');
                }}
                options={[
                  {
                    value: 'supplier_credit',
                    label: t('purchases.returns.mode.supplier_credit'),
                    description: t('purchases.returns.modeHelp.supplier_credit'),
                  },
                  {
                    value: 'cash',
                    label: t('purchases.returns.mode.cash'),
                    description: t('purchases.returns.modeHelp.cash'),
                  },
                ]}
              />
              {mode === 'cash' && (
                <Select
                  label={t('purchases.returns.form.cashAccount')}
                  value={accountId}
                  placeholder={t('purchases.returns.form.chooseAccount')}
                  options={accountOptions}
                  error={accountError}
                  help={
                    accounts.isSuccess && accountOptions.length === 0
                      ? t('purchases.returns.form.noAccounts')
                      : undefined
                  }
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setAccountError('');
                  }}
                />
              )}
            </div>
            <Textarea
              label={t('purchases.returns.form.reason')}
              value={reason}
              maxLength={500}
              rows={4}
              error={reasonError}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <dl className="grid gap-3 sm:grid-cols-3" aria-live="polite">
            <div>
              <dt className="type-caption">{t('purchases.returns.form.subtotal')}</dt>
              <dd className="num">{formatMoney(totals?.net ?? '0.00')}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.form.taxTotal')}</dt>
              <dd className="num">{formatMoney(totals?.tax ?? '0.00')}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('purchases.returns.form.total')}</dt>
              <dd className="num type-section-title">{formatMoney(totals?.gross ?? '0.00')}</dd>
            </div>
          </dl>
        </Card>

        {formError && <FormError message={formError} />}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={busy || nothingLeft}>
            {t('purchases.returns.form.submit')}
          </Button>
          <Link to={back} className="btn btn-secondary">
            {t('purchases.returns.form.cancel')}
          </Link>
        </div>
      </form>
    </PageContainer>
  );
}
