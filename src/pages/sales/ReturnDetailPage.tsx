import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Uuid, type SalesReturn } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { useSettings } from '@/features/settings/useSettings';
import QrCode from '@/features/receipts/QrCode';
import { receiptPageCss } from '@/features/receipts/receiptPrefs';
import '@/features/receipts/receipt.css';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { returnKeys, returnsApi } from '@/services/returnsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { productName } from './usePosCart';
import { ReturnKindBadge } from './ReturnsPage';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start align-top';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end align-top';

/** The printed return receipt (80 mm roll), drawn from the stored return only. */
function ReturnReceipt({
  ret,
  copy,
  shopName,
}: {
  ret: SalesReturn;
  copy: boolean;
  shopName: string;
}) {
  return (
    <div className="receipt" style={{ width: '80mm', padding: '3mm' }}>
      <p className="r-center r-bold">{shopName}</p>
      <p className="r-center">{ret.branch.name}</p>
      <p className="r-center r-bold">{t('returns.receipt.title')}</p>
      {copy && <p className="r-mark">{t('returns.receipt.copy')}</p>}
      <div className="r-row">
        <span className="r-ltr">{ret.number}</span>
        <span className="r-ltr">{formatDateTime(ret.created_at)}</span>
      </div>
      <div className="r-row">
        <span>{t('returns.receipt.sale')}</span>
        <span className="r-ltr">{ret.sale.number}</span>
      </div>
      <div className="r-rule" />
      {ret.lines.map((l) => (
        <div key={l.id}>
          <div>{productName(l)}</div>
          {l.serial && <div className="r-ltr r-small">{l.serial}</div>}
          <div className="r-row">
            <span className="r-ltr">× {formatNumber(l.quantity)}</span>
            <span className="r-ltr">{formatMoney(l.refund_amount)}</span>
          </div>
        </div>
      ))}
      <div className="r-rule" />
      <div className="r-row">
        <span>{t('returns.quote.vat')}</span>
        <span className="r-ltr">{formatMoney(ret.tax_total)}</span>
      </div>
      <div className="r-row r-bold">
        <span>{t('returns.quote.total')}</span>
        <span className="r-ltr">{formatMoney(ret.total)}</span>
      </div>
      {ret.refunds
        .filter((r) => !r.exchange)
        .map((r) => (
          <div key={r.id} className="r-row">
            <span>{t(`returns.methods.${r.method}`)}</span>
            <span className="r-ltr">{formatMoney(r.amount)}</span>
          </div>
        ))}
      {ret.contract_change && (
        <p className="r-small">
          {t('returns.detail.contractChange', {
            number: ret.contract_change.contract_number,
            amount: formatMoney(ret.contract_change.remaining_after),
          })}
        </p>
      )}
      {ret.fiscal?.qr_payload && (
        <div className="r-center">
          <QrCode value={ret.fiscal.qr_payload} label={ret.number} sizeMm={30} />
        </div>
      )}
    </div>
  );
}

/** S05 (D88): one return with its lines, refunds, contract change, exchange and receipt. */
export default function ReturnDetailPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const settings = useSettings();
  const query = useQuery({
    queryKey: returnKeys.one(orgId, id),
    queryFn: () => returnsApi.get(id),
    enabled: validId,
  });
  const [printing, setPrinting] = useState(false);
  const [copy, setCopy] = useState<boolean | null>(null);

  if (!validId) return <EmptyState role="alert" title={t('returns.detail.notFound')} />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <PageContainer>
          <EmptyState role="alert" title={t('returns.detail.notFound')} />
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <ErrorState title={t('returns.detail.loadFailed')} onRetry={() => void query.refetch()} />
      </PageContainer>
    );
  }
  const ret = query.data;
  if (!ret) return <LoadingState />;
  const shop = settings.data;
  const marked = copy ?? ret.receipt_prints > 0;

  // S04 (D68): the server numbers the prints (the first is the original); without an answer the
  // receipt still prints, as a copy.
  const print = async () => {
    if (printing) return;
    setPrinting(true);
    let isCopy = ret.receipt_prints > 0;
    try {
      isCopy = (await returnsApi.recordReceiptPrint(ret.id)).copy;
    } catch {
      isCopy = true;
    }
    flushSync(() => setCopy(isCopy));
    window.print();
    setPrinting(false);
    void cache.invalidateQueries({ queryKey: returnKeys.one(orgId, id) });
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('returns.detail.title', { number: ret.number })}
        actions={
          <>
            <Link to="/sales/returns" className="btn btn-ghost">
              {t('returns.toList')}
            </Link>
            <Button variant="secondary" loading={printing} onClick={() => void print()}>
              {t('returns.receipt.print')}
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="type-caption">{t('returns.list.kind')}</dt>
              <dd>
                <ReturnKindBadge kind={ret.kind} />
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('returns.list.sale')}</dt>
              <dd>
                <Link to={`/sales/${ret.sale.id}`} className="link" dir="ltr">
                  {ret.sale.number}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="type-caption">{t('returns.list.date')}</dt>
              <dd>{formatBusinessDate(ret.business_date)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('returns.list.customer')}</dt>
              <dd dir="auto">{ret.customer?.name ?? t('returns.detail.walkIn')}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="type-caption">{t('returns.reason')}</dt>
              <dd dir="auto">{ret.reason}</dd>
            </div>
          </dl>
        </Card>

        <div className="overflow-x-auto rounded-control border border-line">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t('returns.lines.title')}</caption>
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className={th}>{t('returns.lines.product')}</th>
                <th className={thNum}>{t('returns.lines.quantity')}</th>
                <th className={th}>{t('returns.lines.condition')}</th>
                <th className={thNum}>{t('returns.quote.vat')}</th>
                <th className={thNum}>{t('returns.list.total')}</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className={td}>
                    <span className="block" dir="auto">
                      {productName(l)}
                    </span>
                    {l.serial && (
                      <span className="type-caption block" dir="ltr">
                        {l.serial}
                      </span>
                    )}
                  </td>
                  <td className={tdNum}>{formatNumber(l.quantity)}</td>
                  <td className={td}>{t(`returns.conditions.${l.condition}`)}</td>
                  <td className={tdNum}>{formatMoney(l.tax_amount)}</td>
                  <td className={tdNum}>{formatMoney(l.refund_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card>
          <dl className="ms-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1">
            <dt className="type-caption">{t('returns.quote.subtotal')}</dt>
            <dd className="num text-end">{formatMoney(ret.subtotal)}</dd>
            <dt className="type-caption">{t('returns.quote.vat')}</dt>
            <dd className="num text-end">{formatMoney(ret.tax_total)}</dd>
            <dt className="type-label">{t('returns.quote.total')}</dt>
            <dd className="num type-section-title text-end" data-testid="return-detail-total">
              {formatMoney(ret.total)}
            </dd>
          </dl>
        </Card>

        <Card>
          <h2 className="type-section-title mb-2">{t('returns.detail.refunds')}</h2>
          {!ret.refunds.length ? (
            <p className="type-caption">{t('returns.detail.noRefunds')}</p>
          ) : (
            <ul className="space-y-1">
              {ret.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {r.exchange
                      ? t('returns.detail.exchangePair')
                      : t(`returns.methods.${r.method}`)}
                    {r.cash_account_name ? ` · ${r.cash_account_name}` : ''}
                    {r.reference ? ` · ${r.reference}` : ''}
                  </span>
                  <span className="num">{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {ret.contract_change && (
            <p className="type-body mt-3" data-testid="contract-change">
              {t('returns.detail.contractChange', {
                number: ret.contract_change.contract_number,
                amount: formatMoney(ret.contract_change.remaining_after),
              })}
            </p>
          )}
          {ret.exchange_sale && (
            <p className="type-body mt-3">
              <Link to={`/sales/${ret.exchange_sale.id}`} className="link">
                {t('returns.detail.exchangeSale', {
                  number: ret.exchange_sale.number,
                  total: formatMoney(ret.exchange_sale.total),
                })}
              </Link>
            </p>
          )}
          {ret.fiscal && (
            <p className="type-caption mt-3">
              {t('returns.detail.fiscal', { status: ret.fiscal.status })}
            </p>
          )}
        </Card>
      </div>
      {/* Only this prints (index.css hides the rest of the page when printing). */}
      {createPortal(
        <div className="print-root" data-receipt-print dir="ltr">
          <style>{receiptPageCss('thermal', shop?.receipt_width_mm ?? 80, null)}</style>
          <ReturnReceipt ret={ret} copy={marked} shopName={shop?.name ?? ''} />
        </div>,
        document.body,
      )}
    </PageContainer>
  );
}
