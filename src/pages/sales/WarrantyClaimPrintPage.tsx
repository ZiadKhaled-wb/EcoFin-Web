import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { WarrantyClaim } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import PageContainer from '@/components/ui/PageContainer';
import FormError from '@/components/ui/FormError';
import { useMe } from '@/features/me/useMe';
import { useAuthStore } from '@/store/authStore';
import { warrantyApi, warrantyKeys } from '@/services/warrantyApi';
import { formatBusinessDate, formatDateTime } from '@/lib/format';
import { t, getLanguage, directionOf } from '@/i18n';
import { receivedCondition } from './warrantyRules';
import './WarrantyReceipt.css';
export function WarrantyReceipt({ claim, shop }: { claim: WarrantyClaim; shop: string }) {
  const serial =
    claim.line.chain.find((u) => u.unit_id === claim.unit_id)?.serial ?? t('sales.warranty.none');
  const fields = [
    ['sales.warranty.number', claim.number],
    ['sales.warranty.date', formatDateTime(claim.created_at)],
    ['sales.warranty.customer', claim.line.customer?.name ?? t('sales.detail.walkIn')],
    ['sales.warranty.product', claim.line.product.name],
    ['sales.warranty.key.serial', serial],
    ['sales.warranty.sale', claim.line.sale_number],
    ['sales.warranty.saleDate', formatBusinessDate(claim.line.sale_date)],
    [
      'sales.warranty.end',
      claim.line.warranty_until
        ? formatBusinessDate(claim.line.warranty_until)
        : t('sales.warranty.none'),
    ],
  ] as const;
  return (
    <article className="warranty-receipt" aria-label={t('sales.warranty.receipt')}>
      <h1>{t('sales.warranty.receipt')}</h1>
      <h2 dir="auto">{shop}</h2>
      <p dir="auto">{claim.line.branch.name}</p>
      <dl>
        {fields.map(([key, value]) => (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd dir="auto">{value}</dd>
          </div>
        ))}
      </dl>
      {claim.out_of_warranty && <strong>{t('sales.warranty.out')}</strong>}
      <h2>{t('sales.warranty.issue')}</h2>
      <p className="whitespace-pre-wrap" dir="auto">
        {claim.issue}
      </p>
      <h2>{t('sales.warranty.condition')}</h2>
      <p className="whitespace-pre-wrap" dir="auto">
        {receivedCondition(claim.resolution)}
      </p>
      <p className="signature">{t('sales.warranty.signature')}</p>
    </article>
  );
}
export default function WarrantyClaimPrintPage() {
  const { id } = useParams(),
    org = useAuthStore((s) => s.orgId),
    me = useMe();
  const q = useQuery({
    queryKey: [...warrantyKeys.all(org), 'claim', id],
    queryFn: () => warrantyApi.get(id!),
    enabled: !!id,
  });
  return (
    <>
      {' '}
      <PageContainer>
        <div className="mb-4 print:hidden">
          <Button onClick={() => window.print()} disabled={!q.data || !me.data}>
            {t('sales.warranty.print')}
          </Button>
        </div>
        {q.isError || me.isError ? (
          <FormError message={t('sales.warranty.loadFailed')} />
        ) : q.data && me.data ? (
          <WarrantyReceipt claim={q.data} shop={me.data.org.name} />
        ) : (
          <p role="status">{t('sales.warranty.loading')}</p>
        )}
      </PageContainer>
      {q.data &&
        me.data &&
        createPortal(
          <div className="print-root" dir={directionOf(getLanguage())}>
            <style>{'@page {size:80mm 210mm;margin:0;}'}</style>
            <WarrantyReceipt claim={q.data} shop={me.data.org.name} />
          </div>,
          document.body,
        )}{' '}
    </>
  );
}
