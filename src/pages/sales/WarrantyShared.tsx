import type { WarrantyLine, ClaimStatus } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import { formatBusinessDate, formatDateTime } from '@/lib/format';
import { t } from '@/i18n';
export function WarrantyBadge({ covered }: { covered: boolean }) {
  return (
    <Badge tone={covered ? 'success' : 'danger'}>
      {t(covered ? 'sales.warranty.in' : 'sales.warranty.out')}
    </Badge>
  );
}
export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <Badge tone={status === 'rejected' ? 'danger' : status === 'closed' ? 'success' : 'warning'}>
      {t(`sales.warranty.status.${status}`)}
    </Badge>
  );
}
export function WarrantyLineDetails({ line }: { line: WarrantyLine }) {
  const fields = [
    ['sales.warranty.product', line.product.name],
    ['sales.warranty.sku', line.product.sku],
    ['sales.warranty.customer', line.customer?.name ?? t('sales.detail.walkIn')],
    ['sales.warranty.branch', line.branch.name],
    ['sales.warranty.sale', line.sale_number],
    ['sales.warranty.saleDate', formatBusinessDate(line.sale_date)],
    [
      'sales.warranty.end',
      line.warranty_until ? formatBusinessDate(line.warranty_until) : t('sales.warranty.none'),
    ],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="type-caption text-muted">{t(label)}</dt>
          <dd dir="auto">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function SerialChain({ line }: { line: WarrantyLine }) {
  return (
    <section className="space-y-2">
      <h2 className="type-section-title">{t('sales.warranty.chain')}</h2>
      <ol className="flex flex-wrap gap-3">
        {line.chain.map((u) => (
          <li key={u.unit_id} className="rounded border border-line p-3">
            <p dir="ltr">{u.serial}</p>
            <p className="type-caption">{formatDateTime(u.at)}</p>
            <p className="type-caption">
              {t('sales.warranty.end')}:{' '}
              {u.warranty_until ? formatBusinessDate(u.warranty_until) : t('sales.warranty.none')}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
