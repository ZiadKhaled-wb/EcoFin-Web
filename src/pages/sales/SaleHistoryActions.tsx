import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SaleVoidBody, type SaleHistoryDetails, type SaleStatus } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { salesHistoryApi } from '@/services/salesHistoryApi';
import { saleKeys } from '@/services/salesApi';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, formatMoney } from '@/lib/format';
import { t, type TranslationKey } from '@/i18n';
export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <Badge tone={status === 'voided' ? 'danger' : status === 'completed' ? 'success' : 'warning'}>
      {t(`sales.history.status.${status}`)}
    </Badge>
  );
}
const blocks: Record<string, TranslationKey> = {
  SUBSCRIPTION_EXPIRED: 'sales.history.blocks.expired',
  PERMISSION_DENIED: 'sales.history.blocks.permission',
  ALREADY_VOIDED: 'sales.history.blocks.voided',
  VOID_NOT_SAME_DAY: 'sales.history.blocks.day',
  VOID_SHIFT_CLOSED: 'sales.history.blocks.shift',
  VOID_HAS_RETURNS: 'sales.history.blocks.returns',
  VOID_HAS_CLAIMS: 'sales.history.blocks.claims',
  VOID_HAS_CONTRACT: 'sales.history.blocks.contract',
  VOID_FISCALIZED: 'sales.history.blocks.fiscal',
};
export default function SaleHistoryActions({ sale }: { sale: SaleHistoryDetails }) {
  const canVoid = useCan('sale.void');
  const org = useAuthStore((s) => s.orgId);
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const mutation = useMutation({
    mutationFn: () => salesHistoryApi.void(sale.id, SaleVoidBody.parse({ reason }).reason, key),
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: saleKeys.all(org) });
      notify.success(t('sales.history.voided'));
    },
  });
  const show = () => {
    setReason('');
    setInvalid(false);
    setKey(crypto.randomUUID());
    mutation.reset();
    setOpen(true);
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaleStatusBadge status={sale.status} />
        {canVoid && sale.voidable ? (
          <Button variant="danger" onClick={show}>
            {t('sales.history.void')}
          </Button>
        ) : (
          <p className="type-caption" role="status">
            {t(blocks[sale.void_block_reason ?? 'PERMISSION_DENIED'] ?? 'sales.history.blocked')}
          </p>
        )}
        {/* Future S04 and S05 action slots, without placeholder controls. */}
        <div data-action-slot="sale-reprint" />
        <div data-action-slot="sale-start-return" />
      </div>
      {!!sale.returns.length && (
        <section className="mt-4 space-y-3" aria-label={t('sales.history.returns')}>
          <h2 className="type-section-title">{t('sales.history.returns')}</h2>
          {sale.returns.map((r) => (
            <dl key={r.id} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
              <div>
                <dt>{t('sales.history.number')}</dt>
                <dd dir="ltr">{r.number}</dd>
              </div>
              <div>
                <dt>{t('sales.history.total')}</dt>
                <dd>{formatMoney(r.total)}</dd>
              </div>
              <div>
                <dt>{t('sales.history.reason')}</dt>
                <dd dir="auto">{r.reason}</dd>
              </div>
              <div>
                <dt>{t('sales.history.by')}</dt>
                <dd>
                  {r.by} · {formatDateTime(r.at)}
                </dd>
              </div>
            </dl>
          ))}
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value);
        }}
        title={t('sales.history.void')}
        description={t('sales.history.confirmDescription', { number: sale.number })}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const valid = SaleVoidBody.safeParse({ reason });
            setInvalid(!valid.success);
            if (valid.success && !mutation.isPending) mutation.mutate();
          }}
        >
          <Textarea
            label={t('sales.history.reason')}
            value={reason}
            maxLength={200}
            disabled={mutation.isPending}
            onChange={(event) => setReason(event.target.value)}
          />
          <FormError
            message={
              invalid
                ? t('sales.history.reasonInvalid')
                : mutation.isError
                  ? t('sales.history.voidFailed')
                  : ''
            }
          />
          <Button
            type="submit"
            variant="danger"
            disabled={mutation.isPending}
            loading={mutation.isPending}
          >
            {t('sales.history.confirm')}
          </Button>
        </form>
      </Dialog>
    </Card>
  );
}
