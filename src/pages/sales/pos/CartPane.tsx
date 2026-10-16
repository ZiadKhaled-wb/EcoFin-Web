import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { compareMoney, type SaleQuote } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import IconButton from '@/components/ui/IconButton';
import { XIcon } from '@/components/ui/Icons';
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import Can from '@/features/me/Can';
import { ApiError } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { customerKeys, customersApi } from '@/services/customersApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { saleError } from '../saleShared';
import type { CartLine, PosCart } from '../usePosCart';
import ApprovalPanel from './ApprovalPanel';
import DiscountControl from './DiscountControl';
import type { CartApproval } from './useCartApproval';
import { POS_SHORTCUTS } from './usePosShortcuts';

const th = 'type-label py-2 text-start';
const thNum = 'type-label py-2 text-end';
const ZERO = '0.00';
/** A number with its percent sign keeps its own direction inside Arabic text. */
const pct = (value: string) => `⁦${value}%⁩`;

/** The key of a button, shown beside its text and left out of its name. */
function Key({ k }: { k: string }) {
  return (
    <kbd aria-hidden className="num ms-2 text-[0.75rem] opacity-70">
      {k}
    </kbd>
  );
}

/**
 * S06: the cart side of the POS: the customer, the lines, the discounts and their reason, the
 * totals and the actions. Every number shown is the quote's.
 */
export default function CartPane({
  cart,
  canPay,
  customersOn,
  mode = 'cash',
  onMode,
  heldCount,
  error,
  approval,
  approvalError,
  panelRef,
  discountRef,
  onCustomer,
  onModuleMissing,
  onHold,
  onHeld,
  onPay,
  onAsk,
  onHelp,
}: {
  cart: PosCart;
  canPay: boolean;
  /** False once the server said the plan has no customers. */
  customersOn: boolean;
  /** N02: a cash sale or a sale on installments; the switch shows only with `onMode`. */
  mode?: 'cash' | 'installments';
  onMode?: (mode: 'cash' | 'installments') => void;
  heldCount: number;
  error: string;
  approval: CartApproval;
  approvalError: string;
  panelRef: RefObject<HTMLElement | null>;
  /** The element around the sale discount's value (F7). */
  discountRef: RefObject<HTMLDivElement | null>;
  onCustomer: () => void;
  onModuleMissing: () => void;
  onHold: () => void;
  onHeld: () => void;
  onPay: () => void;
  onAsk: () => void;
  onHelp: () => void;
}) {
  const quote = cart.quote;
  const over = (index: number) => {
    const q = quote?.lines[index];
    return cart.current && q !== undefined && q.quantity > q.available ? q.available : null;
  };
  const hasLines = cart.lines.length > 0;

  // The newest line is brought into view.
  const lastRow = useRef<HTMLTableRowElement>(null);
  const count = cart.lines.length;
  useEffect(() => {
    if (count > 0) lastRow.current?.scrollIntoView?.({ block: 'nearest' });
  }, [count]);

  const message =
    error ||
    (cart.quoteError
      ? saleError(cart.quoteError)
      : cart.discountInvalid
        ? t('sales.errors.discountInvalid')
        : '');
  const showReason = cart.hasDiscount || cart.reason !== '';

  return (
    <section className="flex min-h-0 flex-col rounded-panel border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="type-section-title">{t('sales.pos.cart')}</h2>
        <span className="flex items-center gap-2">
          {onMode && (
            <span role="group" aria-label={t('installments.pos.mode')} className="flex gap-1">
              {(['cash', 'installments'] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? 'primary' : 'secondary'}
                  aria-pressed={mode === m}
                  disabled={cart.busy}
                  onClick={() => onMode(m)}
                >
                  {t(`installments.pos.${m}`)}
                </Button>
              ))}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={onHelp}>
            {t('sales.pos.keys.title')}
          </Button>
        </span>
      </header>
      {customersOn && (
        <CustomerRow cart={cart} onCustomer={onCustomer} onModuleMissing={onModuleMissing} />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {!hasLines ? (
          <p className="type-caption py-2">{t('sales.pos.emptyCart')}</p>
        ) : (
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t('sales.pos.cart')}</caption>
            <thead>
              <tr>
                <th className={th}>{t('sales.pos.product')}</th>
                <th className={thNum}>{t('sales.pos.lineTotal')}</th>
                <th className="sr-only">{t('sales.pos.remove')}</th>
              </tr>
            </thead>
            <tbody>
              {cart.lines.map((line, i) => (
                <CartRow
                  key={line.key}
                  line={line}
                  quoted={quote?.lines[i]}
                  available={over(i)}
                  cart={cart}
                  rowRef={i === count - 1 ? lastRow : undefined}
                />
              ))}
            </tbody>
          </table>
        )}
        {hasLines && (
          <div className="space-y-2 border-t border-line py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-label">
                {t('sales.pos.discount.sale')}
                <Key k={POS_SHORTCUTS.discount} />
              </span>
              <DiscountControl
                value={cart.saleDiscount}
                onChange={cart.setSaleDiscount}
                typeLabel={t('sales.pos.discount.saleType')}
                valueLabel={t('sales.pos.discount.sale')}
                valueRef={discountRef}
                shortcut={POS_SHORTCUTS.discount}
              />
            </div>
            {showReason && (
              <FormField
                label={t('sales.pos.discount.reason')}
                value={cart.reason}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => cart.setReason(e.target.value)}
                {...(cart.reasonOk ? {} : { help: t('sales.errors.discountReasonRequired') })}
              />
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="type-caption">{t('sales.pos.subtotal')}</dt>
              <dd className="num text-end">{quote ? formatMoney(quote.subtotal) : ''}</dd>
              {quote && compareMoney(quote.discount_total, ZERO) > 0 && (
                <>
                  <dt className="type-caption">{t('sales.pos.discount.total')}</dt>
                  <dd className="num text-end" data-testid="sale-discount">
                    −{formatMoney(quote.discount_total)}
                  </dd>
                </>
              )}
              <dt className="type-caption">{t('sales.pos.vatTotal')}</dt>
              <dd className="num text-end">{quote ? formatMoney(quote.tax_total) : ''}</dd>
            </dl>
          </div>
        )}
      </div>
      {/* Always in view: the total, what stops the sale, and the actions. */}
      <div className="space-y-2 border-t border-line px-4 py-3">
        {hasLines && (
          <div>
            <p className="flex items-baseline justify-between gap-4">
              <span className="type-label">{t('sales.pos.total')}</span>
              <span className="num type-section-title" data-testid="sale-total">
                {quote ? formatMoney(quote.total) : ''}
              </span>
            </p>
            <p className="type-caption">
              {cart.quoting
                ? t('sales.pos.quoting')
                : quote
                  ? t(quote.prices_include_vat ? 'sales.pos.vatIncluded' : 'sales.pos.vatAdded')
                  : ''}
            </p>
          </div>
        )}
        <FormError message={message} />
        {approval.open && (
          <ApprovalPanel
            approval={approval}
            error={approvalError}
            panelRef={panelRef}
            onAsk={onAsk}
          />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasLines || cart.busy}
            aria-keyshortcuts={POS_SHORTCUTS.hold}
            onClick={onHold}
          >
            {t('sales.pos.hold.action')}
            <Key k={POS_SHORTCUTS.hold} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-keyshortcuts={POS_SHORTCUTS.held}
            onClick={onHeld}
          >
            {t('sales.pos.held.action', { count: formatNumber(heldCount) })}
            <Key k={POS_SHORTCUTS.held} />
          </Button>
          <Button
            loading={cart.busy}
            disabled={!canPay}
            aria-keyshortcuts={POS_SHORTCUTS.pay}
            onClick={onPay}
          >
            {mode === 'installments' ? t('installments.pos.terms') : t('sales.pos.confirm')}
            <Key k={POS_SHORTCUTS.pay} />
          </Button>
        </div>
      </div>
    </section>
  );
}

/** "Walk-in customer" or the chosen one, with the store credit the quote reports. */
function CustomerRow({
  cart,
  onCustomer,
  onModuleMissing,
}: {
  cart: PosCart;
  onCustomer: () => void;
  onModuleMissing: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const chosen = cart.customer;
  // A customer named only by `?customer=<id>`: the name is read once.
  const read = useQuery({
    queryKey: customerKeys.one(orgId, chosen?.id ?? ''),
    queryFn: async () => {
      try {
        return await customersApi.get(chosen?.id ?? '');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'MODULE_NOT_IN_PLAN') onModuleMissing();
        throw err;
      }
    },
    enabled: chosen !== null && chosen.name === null,
    retry: false,
  });
  const name = chosen
    ? (chosen.name ?? read.data?.full_name ?? t('sales.pos.customer.chosen'))
    : t('sales.detail.walkIn');
  const phone = chosen ? (chosen.phone ?? read.data?.phones[0] ?? null) : null;
  const credit = chosen ? (cart.quote?.store_credit_balance ?? null) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
      <p className="min-w-0" data-testid="pos-customer">
        <span className="block truncate">
          <bdi>{name}</bdi>
        </span>
        {phone && (
          <span className="type-caption block" dir="ltr">
            {phone}
          </span>
        )}
        {credit !== null && compareMoney(credit, ZERO) > 0 && (
          <span className="type-caption block">
            {t('sales.pos.customer.credit', { amount: formatMoney(credit) })}
          </span>
        )}
      </p>
      <span className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-keyshortcuts={POS_SHORTCUTS.customer}
          onClick={onCustomer}
        >
          {t(chosen ? 'sales.pos.customer.change' : 'sales.pos.customer.choose')}
          <Key k={POS_SHORTCUTS.customer} />
        </Button>
        {chosen && (
          <Button size="sm" variant="ghost" onClick={() => cart.setCustomer(null)}>
            {t('sales.pos.customer.clear')}
          </Button>
        )}
      </span>
    </div>
  );
}

function CartRow({
  line,
  quoted,
  available,
  cart,
  rowRef,
}: {
  line: CartLine;
  quoted: SaleQuote['lines'][number] | undefined;
  /** What the branch has, when the line asks for more. */
  available: number | null;
  cart: PosCart;
  rowRef: RefObject<HTMLTableRowElement | null> | undefined;
}) {
  const [discountOpen, setDiscountOpen] = useState(line.discount.value !== '');
  const discounted = quoted !== undefined && compareMoney(quoted.discount_amount, ZERO) > 0;
  return (
    <>
      <tr ref={rowRef} className="border-t border-line align-top">
        <td className="py-2 pe-2">
          <span className="block" dir="auto">
            {line.name}
          </span>
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 [&_.field-label]:sr-only">
            <span className="type-caption break-all" dir="ltr">
              {line.serial ?? line.sku}
            </span>
            {!line.unit_id && (
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="btn-icon"
                  aria-label={t('sales.pos.less', { name: line.name })}
                  onClick={() => cart.stepQuantity(line.key, -1)}
                >
                  −
                </Button>
                <span className="w-12">
                  <NumberInput
                    label={t('sales.pos.quantityOf', { name: line.name })}
                    value={line.quantity}
                    decimals={0}
                    maxLength={6}
                    onValueChange={(v) => cart.setQuantity(line.key, v)}
                  />
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="btn-icon"
                  aria-label={t('sales.pos.more', { name: line.name })}
                  onClick={() => cart.stepQuantity(line.key, 1)}
                >
                  +
                </Button>
              </span>
            )}
          </span>
          {available !== null && (
            <Badge tone="danger">
              {t('sales.pos.onlyAvailable', { count: formatNumber(available) })}
            </Badge>
          )}
          {quoted?.overridden && (
            <Badge tone="warning">
              {t('sales.pos.overridden', { price: formatMoney(quoted.list_price) })}
            </Badge>
          )}
          {discounted && (
            <span className="type-caption block" data-testid="line-discount">
              {t('sales.pos.discount.line', {
                amount: formatMoney(quoted.discount_amount),
                pct: pct(quoted.effective_pct),
              })}
            </span>
          )}
        </td>
        <td className="type-body py-2 text-end [&_.field-label]:sr-only">
          <span className="num block whitespace-nowrap">
            {quoted ? formatMoney(quoted.line_total) : ''}
          </span>
          <span className="num type-caption block whitespace-nowrap">
            {quoted ? `${formatNumber(quoted.quantity)} × ${formatMoney(quoted.unit_price)}` : ''}
          </span>
          <Can permission="price.override">
            <span className="ms-auto mt-1 block w-32">
              <MoneyInput
                label={t('sales.pos.priceOf', { name: line.name })}
                value={line.price}
                onValueChange={(v) => cart.setPrice(line.key, v)}
              />
            </span>
          </Can>
        </td>
        <td className="py-2 ps-1 text-end">
          <span className="flex flex-col items-end gap-1">
            <IconButton
              size="sm"
              label={t('sales.pos.removeOf', { name: line.name })}
              icon={<XIcon />}
              onClick={() => cart.remove(line.key)}
            />
            {!discountOpen && (
              <Button
                size="sm"
                variant="ghost"
                className="btn-icon"
                aria-label={t('sales.pos.discount.addOf', { name: line.name })}
                title={t('sales.pos.discount.action')}
                onClick={() => setDiscountOpen(true)}
              >
                %
              </Button>
            )}
          </span>
        </td>
      </tr>
      {discountOpen && (
        <tr>
          <td colSpan={3} className="pb-2">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-caption">{t('sales.pos.discount.action')}</span>
              <DiscountControl
                value={line.discount}
                onChange={(d) => cart.setLineDiscount(line.key, d)}
                typeLabel={t('sales.pos.discount.typeOf', { name: line.name })}
                valueLabel={t('sales.pos.discount.of', { name: line.name })}
              />
            </span>
          </td>
        </tr>
      )}
    </>
  );
}
