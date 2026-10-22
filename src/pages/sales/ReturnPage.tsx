import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReturnReason,
  Uuid,
  compareMoney,
  sumMoney,
  type ReturnCondition,
  type SaleReturnable,
  type SalesReturnCreateInput,
  type SalesReturnQuoteBody,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import Input from '@/components/ui/Input';
import LoadingState from '@/components/ui/LoadingState';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { cashKeys } from '@/services/cashApi';
import { productsApi } from '@/services/productsApi';
import { returnKeys, returnsApi } from '@/services/returnsApi';
import { saleKeys } from '@/services/salesApi';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { productName } from './usePosCart';
import {
  defaultRefunds,
  lineQuantity,
  refundBody,
  returnErrorMessage,
  type RefundDraft,
  type RefundMethod as Method,
} from './returnShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start align-top';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end align-top';

type NewLine = { product_id: string; name: string; quantity: string };

function Refused({ title, hint, saleId }: { title: string; hint?: string; saleId?: string }) {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={title}
        {...(hint ? { description: hint } : {})}
        action={
          <Link to={saleId ? `/sales/${saleId}` : '/sales/history'} className="btn btn-secondary">
            {t('returns.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

/**
 * S05 (D88): take goods back against a sale. Quantities are capped at what can still come back,
 * a serialized line ticks its own unit (a scan finds it), each line has a condition; the server
 * works out every amount (the quote) and the refund lines must add up to what it says goes back.
 * An installment sale shows what is owed before and after; an exchange adds the new items. One
 * idempotency key per form, so a second click posts the same return.
 */
export default function ReturnPage() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const claimId = search.get('claim');
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, ReturnCondition>>({});
  const [scan, setScan] = useState('');
  const [scanError, setScanError] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [refunds, setRefunds] = useState<RefundDraft[]>([]);
  const [touchedRefunds, setTouchedRefunds] = useState(false);
  const [exchange, setExchange] = useState(false);
  const [newLines, setNewLines] = useState<NewLine[]>([]);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const returnable = useQuery({
    queryKey: returnKeys.returnable(orgId, id),
    queryFn: () => returnsApi.returnable(id),
    enabled: validId,
  });
  const sale = useQuery({
    queryKey: saleKeys.one(orgId, id),
    queryFn: () => salesHistoryApi.get(id),
    enabled: validId,
  });
  const data = returnable.data;

  const picked = useMemo(
    () =>
      (data?.lines ?? [])
        .map((l) => ({ line: l, qty: Number(lineQuantity(l, quantities, claimId) || '0') }))
        .filter((p) => Number.isInteger(p.qty) && p.qty > 0 && p.qty <= p.line.returnable),
    [data, quantities, claimId],
  );
  const claim =
    claimId && data?.lines.some((l) => l.warranty_claim_id === claimId) ? claimId : null;

  const body: SalesReturnQuoteBody | null =
    data && picked.length
      ? {
          sale_id: id,
          kind: exchange ? 'exchange' : 'return',
          lines: picked.map((p) => ({
            sale_line_id: p.line.sale_line_id,
            quantity: p.qty,
            condition: conditions[p.line.sale_line_id] ?? 'resellable',
            ...(p.line.unit_id ? { unit_id: p.line.unit_id } : {}),
          })),
          ...(claim ? { warranty_claim_id: claim } : {}),
          ...(exchange
            ? {
                new_sale: {
                  lines: newLines
                    .filter((l) => Number(l.quantity) > 0)
                    .map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
                },
              }
            : {}),
        }
      : null;
  const exchangeReady = !exchange || (body?.new_sale?.lines.length ?? 0) > 0;
  const quote = useQuery({
    queryKey: returnKeys.quote(orgId, JSON.stringify(body)),
    queryFn: () => returnsApi.quote(body!),
    enabled: !!body && exchangeReady,
    retry: false,
  });
  const q = quote.data;
  const due = q?.refund_due ?? '0.00';
  const contractSale = !!data?.contract;

  // Until the cashier edits them, the refund lines follow the quote (returnShared.defaultRefunds).
  const shownRefunds = touchedRefunds
    ? refunds
    : defaultRefunds(q, contractSale, !!data?.sale.customer_id);
  const editRefunds = (change: (current: RefundDraft[]) => RefundDraft[]) => {
    setTouchedRefunds(true);
    setRefunds(change(shownRefunds));
  };

  // Banks the money can go back to: the sale's own (a cash sale) or any it was paid into.
  const banks = (sale.data?.payments ?? [])
    .filter((p) => p.method === 'bank_transfer' && p.cash_account_id)
    .map((p) => ({ value: p.cash_account_id!, label: p.cash_account_name ?? '' }))
    .filter((b, i, all) => all.findIndex((x) => x.value === b.value) === i);
  const refundLines = refundBody(shownRefunds);
  const refundSum = sumMoney(refundLines.map((r) => r.amount));
  const refundsMatch = compareMoney(refundSum, due) === 0;

  if (!validId) return <Refused title={t('returns.notFound')} hint={t('returns.notFoundHint')} />;
  if (returnable.isError && !data) {
    if (returnable.error instanceof ApiError && returnable.error.status === 404) {
      return <Refused title={t('returns.notFound')} hint={t('returns.notFoundHint')} />;
    }
    return (
      <PageContainer>
        <ErrorState title={t('returns.loadFailed')} onRetry={() => void returnable.refetch()} />
      </PageContainer>
    );
  }
  if (!data) return <LoadingState />;
  if (data.blocked) return <Refused title={t(`returns.blocked.${data.blocked}`)} saleId={id} />;

  const byUnit = (serial: string) =>
    data.lines.find((l) => l.serial !== null && l.serial.toLowerCase() === serial.toLowerCase());
  const onScan = () => {
    const serial = scan.trim();
    if (!serial) return;
    const line = byUnit(serial);
    if (!line || line.returnable < 1) {
      setScanError(t('returns.scan.notFound', { serial }));
      return;
    }
    setScanError('');
    setQuantities((qs) => ({ ...qs, [line.sale_line_id]: '1' }));
    setScan('');
  };
  const addProduct = async () => {
    const value = code.trim();
    if (!value) return;
    try {
      const product = await productsApi.lookup(value);
      setCodeError('');
      setNewLines((lines) =>
        lines.some((l) => l.product_id === product.id)
          ? lines
          : [...lines, { product_id: product.id, name: productName(product), quantity: '1' }],
      );
      setCode('');
    } catch {
      setCodeError(t('returns.exchange.notFound'));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (posting.current || !body || !q) return;
    const validReason = ReturnReason.safeParse(reason);
    setReasonError(validReason.success ? '' : t('returns.reasonInvalid'));
    if (!validReason.success || !refundsMatch) return;
    const payload: SalesReturnCreateInput = {
      ...body,
      refunds: refundLines,
      reason: validReason.data,
      expected_total: q.total,
      ...(body.new_sale && q.exchange
        ? {
            new_sale: {
              ...body.new_sale,
              expected_total: q.exchange.new_total,
              ...(compareMoney(q.exchange.to_pay, '0.00') > 0
                ? { payments: [{ method: 'cash' as const, amount: q.exchange.to_pay }] }
                : {}),
            },
          }
        : {}),
    };
    posting.current = true;
    setBusy(true);
    setFormError('');
    try {
      const made = await returnsApi.create(payload, key);
      await Promise.all([
        cache.invalidateQueries({ queryKey: returnKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: saleKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: stockKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: ['shifts', orgId] }),
        cache.invalidateQueries({ queryKey: ['installments', orgId] }),
      ]);
      notify.success(t('returns.posted', { number: made.number }));
      // The form stays locked: the return is posted.
      navigate(`/sales/returns/${made.id}`, { replace: true });
    } catch (error) {
      posting.current = false;
      setBusy(false);
      setFormError(returnErrorMessage(error));
    }
  };

  const periodPassed = data.period_passed && !claim;
  const lockedOut = periodPassed && !data.can_pass_period;
  const canConfirm =
    !!q && !quote.isFetching && refundsMatch && exchangeReady && !busy && !lockedOut;

  return (
    <PageContainer>
      <PageHeader
        title={t('returns.newTitle', { number: data.sale.number })}
        actions={
          <Link to={`/sales/${id}`} className="btn btn-ghost">
            {t('returns.back')}
          </Link>
        }
      />
      <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        <Card>
          <p className="type-body">
            {t('returns.deadline', { date: formatBusinessDate(data.deadline) })}
          </p>
          {claim && <Notice tone="info">{t('returns.claimNote')}</Notice>}
          {periodPassed && (
            <Notice tone={data.can_pass_period ? 'info' : 'error'}>
              {t(data.can_pass_period ? 'returns.periodOwner' : 'returns.periodPassed', {
                date: formatBusinessDate(data.deadline),
              })}
            </Notice>
          )}
        </Card>

        <Card>
          <h2 className="type-section-title mb-3">{t('returns.lines.title')}</h2>
          {data.lines.some((l) => l.serial !== null) && (
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <label className="type-label block" htmlFor="return-scan">
                  {t('returns.scan.label')}
                </label>
                <Input
                  id="return-scan"
                  ltr
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onScan();
                    }
                  }}
                />
                <p className="type-caption">{t('returns.scan.help')}</p>
              </div>
              <FormError message={scanError} />
            </div>
          )}
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t('returns.lines.title')}</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('returns.lines.product')}</th>
                  <th className={thNum}>{t('returns.lines.sold')}</th>
                  <th className={thNum}>{t('returns.lines.returned')}</th>
                  <th className={th}>{t('returns.lines.quantity')}</th>
                  <th className={th}>{t('returns.lines.condition')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <ReturnLineRow
                    key={l.sale_line_id}
                    line={l}
                    quantity={lineQuantity(l, quantities, claimId)}
                    condition={conditions[l.sale_line_id] ?? 'resellable'}
                    disabled={busy}
                    onQuantity={(v) => setQuantities((qs) => ({ ...qs, [l.sale_line_id]: v }))}
                    onCondition={(v) => setConditions((cs) => ({ ...cs, [l.sale_line_id]: v }))}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!picked.length && <p className="type-caption mt-2">{t('returns.lines.none')}</p>}
        </Card>

        {!contractSale && (
          <Card>
            <Switch
              label={t('returns.exchange.toggle')}
              checked={exchange}
              disabled={busy}
              onChange={(e) => {
                setExchange(e.target.checked);
                setTouchedRefunds(false);
              }}
            />
            {exchange && (
              <div className="mt-3 space-y-3">
                <h2 className="type-section-title">{t('returns.exchange.title')}</h2>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-64 flex-1">
                    <label className="type-label block" htmlFor="exchange-code">
                      {t('returns.exchange.code')}
                    </label>
                    <Input
                      id="exchange-code"
                      ltr
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addProduct();
                        }
                      }}
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void addProduct()}>
                    {t('returns.exchange.add')}
                  </Button>
                </div>
                <FormError message={codeError} />
                {!newLines.length && <p className="type-caption">{t('returns.exchange.empty')}</p>}
                {newLines.map((l, i) => (
                  <div key={l.product_id} className="flex flex-wrap items-end gap-2">
                    <span className="type-body flex-1" dir="auto">
                      {l.name}
                    </span>
                    <NumberInput
                      label={t('returns.exchange.quantity')}
                      value={l.quantity}
                      onValueChange={(v) =>
                        setNewLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: v } : x)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setNewLines((ls) => ls.filter((_, j) => j !== i))}
                    >
                      {t('returns.exchange.remove')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {body && (
          <Card aria-live="polite">
            {quote.isFetching && !q ? (
              <p role="status">{t('returns.quote.loading')}</p>
            ) : quote.isError ? (
              <FormError message={returnErrorMessage(quote.error)} />
            ) : q ? (
              <QuoteSummary quote={q} />
            ) : null}
          </Card>
        )}

        {q && (
          <Card>
            <h2 className="type-section-title mb-3">{t('returns.refunds.title')}</h2>
            {compareMoney(due, '0.00') === 0 ? (
              <p className="type-caption">{contractSale ? t('returns.refunds.noneNeeded') : ''}</p>
            ) : (
              <div className="space-y-3">
                {shownRefunds.map((r, i) => (
                  <RefundRow
                    key={i}
                    draft={r}
                    banks={banks}
                    hasCustomer={!!data.sale.customer_id}
                    available={contractSale ? null : (q.refundable ?? null)}
                    disabled={busy}
                    onChange={(next) => editRefunds((rs) => rs.map((x, j) => (j === i ? next : x)))}
                    onRemove={() => editRefunds((rs) => rs.filter((_, j) => j !== i))}
                  />
                ))}
                {shownRefunds.length < 5 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      editRefunds((rs) => [
                        ...rs,
                        { method: 'cash', amount: '', cash_account_id: '', reference: '' },
                      ])
                    }
                  >
                    {t('returns.refunds.add')}
                  </Button>
                )}
                <p
                  className={refundsMatch ? 'type-caption' : 'type-caption text-danger-600'}
                  role="status"
                  data-testid="refund-sum"
                >
                  {refundsMatch
                    ? t('returns.refunds.sum', { amount: formatMoney(refundSum) })
                    : t('returns.refunds.mismatch', { amount: formatMoney(due) })}
                </p>
              </div>
            )}
          </Card>
        )}

        <Card>
          <Textarea
            label={t('returns.reason')}
            value={reason}
            maxLength={200}
            disabled={busy}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
          />
          <FormError message={formError} />
          <div className="mt-3">
            <Button type="submit" disabled={!canConfirm} loading={busy}>
              {t(exchange ? 'returns.confirmExchange' : 'returns.confirm')}
            </Button>
          </div>
        </Card>
      </form>
    </PageContainer>
  );
}

function ReturnLineRow({
  line,
  quantity,
  condition,
  disabled,
  onQuantity,
  onCondition,
}: {
  line: SaleReturnable['lines'][number];
  quantity: string;
  condition: ReturnCondition;
  disabled: boolean;
  onQuantity: (value: string) => void;
  onCondition: (value: ReturnCondition) => void;
}) {
  const none = line.returnable < 1;
  return (
    <tr className="border-b border-line">
      <td className={td}>
        <span className="block" dir="auto">
          {productName(line)}
        </span>
        <span className="type-caption block" dir="ltr">
          {line.sku}
        </span>
        {line.serial && (
          <span className="type-caption block" dir="ltr">
            {line.serial}
          </span>
        )}
      </td>
      <td className={tdNum}>{formatNumber(line.sold)}</td>
      <td className={tdNum}>{formatNumber(line.returned)}</td>
      <td className={td}>
        {line.is_serialized ? (
          <Checkbox
            label={t('returns.lines.pick')}
            checked={quantity === '1'}
            disabled={disabled || none}
            onChange={(e) => onQuantity(e.target.checked ? '1' : '')}
          />
        ) : (
          <NumberInput
            label={t('returns.lines.quantity')}
            value={quantity}
            disabled={disabled || none}
            help={t('returns.lines.returnable') + ': ' + formatNumber(line.returnable)}
            error={
              Number(quantity) > line.returnable ? t('returns.errors.RETURN_QTY_EXCEEDED') : ''
            }
            onValueChange={onQuantity}
          />
        )}
      </td>
      <td className={td}>
        <Select
          label={t('returns.lines.condition')}
          value={condition}
          disabled={disabled || none}
          options={[
            { value: 'resellable', label: t('returns.conditions.resellable') },
            { value: 'damaged', label: t('returns.conditions.damaged') },
          ]}
          onChange={(e) => onCondition(e.target.value === 'damaged' ? 'damaged' : 'resellable')}
        />
      </td>
    </tr>
  );
}

function QuoteSummary({
  quote,
}: {
  quote: NonNullable<Awaited<ReturnType<typeof returnsApi.quote>>>;
}) {
  const c = quote.contract;
  return (
    <div className="space-y-3">
      <dl className="ms-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1">
        <dt className="type-caption">{t('returns.quote.subtotal')}</dt>
        <dd className="num text-end">{formatMoney(quote.subtotal)}</dd>
        <dt className="type-caption">{t('returns.quote.vat')}</dt>
        <dd className="num text-end">{formatMoney(quote.tax_total)}</dd>
        <dt className="type-label">{t('returns.quote.total')}</dt>
        <dd className="num type-section-title text-end" data-testid="return-total">
          {formatMoney(quote.total)}
        </dd>
      </dl>
      {c && (
        <section
          aria-label={t('returns.contract.title', { number: c.number })}
          className="space-y-1"
        >
          <h3 className="type-label">{t('returns.contract.title', { number: c.number })}</h3>
          <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1">
            <dt className="type-caption">{t('returns.contract.remainingBefore')}</dt>
            <dd className="num text-end">{formatMoney(c.remaining_before)}</dd>
            <dt className="type-caption">{t('returns.contract.credit')}</dt>
            <dd className="num text-end">{formatMoney(c.credit)}</dd>
            <dt className="type-label">{t('returns.contract.remainingAfter')}</dt>
            <dd className="num text-end" data-testid="remaining-after">
              {formatMoney(c.remaining_after)}
            </dd>
          </dl>
          <p className="type-body" data-testid="new-installments">
            {c.installment_amount
              ? t('returns.contract.installments', {
                  count: formatNumber(c.installments_left),
                  amount: formatMoney(c.installment_amount),
                })
              : t('returns.contract.noneLeft')}
          </p>
          {compareMoney(c.overpaid, '0.00') > 0 && (
            <p className="type-body">
              {t('returns.contract.overpaid', { amount: formatMoney(c.overpaid) })}
            </p>
          )}
        </section>
      )}
      {quote.exchange && (
        <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1">
          <dt className="type-caption">{t('returns.exchange.newTotal')}</dt>
          <dd className="num text-end">{formatMoney(quote.exchange.new_total)}</dd>
          <dt className="type-caption">{t('returns.exchange.creditUsed')}</dt>
          <dd className="num text-end">{formatMoney(quote.exchange.credit_used)}</dd>
          <dt className="type-label">{t('returns.exchange.toPay')}</dt>
          <dd className="num text-end" data-testid="exchange-to-pay">
            {formatMoney(quote.exchange.to_pay)}
          </dd>
        </dl>
      )}
      <p className="type-label" data-testid="refund-due">
        {t('returns.quote.refundDue', { amount: formatMoney(quote.refund_due) })}
      </p>
    </div>
  );
}

function RefundRow({
  draft,
  banks,
  hasCustomer,
  available,
  disabled,
  onChange,
  onRemove,
}: {
  draft: RefundDraft;
  banks: { value: string; label: string }[];
  hasCustomer: boolean;
  available: { cash: string; bank_transfer: string } | null;
  disabled: boolean;
  onChange: (next: RefundDraft) => void;
  onRemove: () => void;
}) {
  const methods: Method[] = ['cash', 'bank_transfer', 'store_credit'];
  const cap = available && draft.method !== 'store_credit' ? available[draft.method] : null;
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
      <Select
        label={t('returns.refunds.method')}
        value={draft.method}
        disabled={disabled}
        options={methods
          .filter((m) => m !== 'store_credit' || hasCustomer)
          .filter((m) => m !== 'bank_transfer' || banks.length > 0)
          .map((m) => ({ value: m, label: t(`returns.methods.${m}`) }))}
        onChange={(e) => onChange({ ...draft, method: e.target.value as Method })}
      />
      <MoneyInput
        label={t('returns.refunds.amount')}
        value={draft.amount}
        disabled={disabled}
        {...(cap ? { help: t('returns.refunds.available', { amount: formatMoney(cap) }) } : {})}
        onValueChange={(v) => onChange({ ...draft, amount: v })}
      />
      {draft.method === 'bank_transfer' ? (
        <>
          <Select
            label={t('returns.refunds.bank')}
            value={draft.cash_account_id}
            disabled={disabled}
            placeholder="—"
            options={banks}
            onChange={(e) => onChange({ ...draft, cash_account_id: e.target.value })}
          />
          <div>
            <label className="type-label block">
              {t('returns.refunds.reference')}
              <Input
                ltr
                value={draft.reference}
                maxLength={100}
                disabled={disabled}
                onChange={(e) => onChange({ ...draft, reference: e.target.value })}
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <span />
          <span />
        </>
      )}
      <Button type="button" variant="ghost" disabled={disabled} onClick={onRemove}>
        {t('returns.refunds.remove')}
      </Button>
    </div>
  );
}
