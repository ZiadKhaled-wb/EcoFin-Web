import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  StockTransfer,
  StockTransferLine,
  StockTransferReceiveLine,
  TransferDiscrepancyReason,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { formatDateTime, formatNumber } from '@/lib/format';
import { stockApi, stockKeys } from '@/services/stockApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import TransferForm from './TransferForm';
import { TRANSFER_TONE, transferError } from './transferShared';

const lineName = (l: StockTransferLine) =>
  getLanguage() === 'en' && l.name_en ? l.name_en : l.name_ar;

/** I03: one transfer, its lines, and what can happen next (edit, send, cancel, receive). */
export default function TransferPage() {
  const { id = '' } = useParams();
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const branches = useBranches();
  const canSend = useCan('stock.transfer_send');
  const canReceive = useCan('stock.transfer_receive');
  const transfer = useQuery({
    queryKey: stockKeys.transfer(orgId, id),
    queryFn: () => stockApi.transfer(id),
  });
  const destinations = useQuery({
    queryKey: stockKeys.destinations(orgId),
    queryFn: stockApi.transferDestinations,
    enabled: canSend,
  });
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const tr = transfer.data;
  const refresh = () => cache.invalidateQueries({ queryKey: stockKeys.all(orgId) });
  // The branch rules are checked by the server; this only hides buttons that can't work.
  const mine = new Set((branches.data ?? []).map((b) => b.id));

  function act(run: () => Promise<StockTransfer>, done: string, close: () => void) {
    setBusy(true);
    run()
      .then(async () => {
        notify.success(done);
        close();
        await refresh();
      })
      .catch((err: unknown) => notify.error(transferError(err)))
      .finally(() => setBusy(false));
  }

  if (transfer.isError && !tr) {
    return (
      <PageContainer>
        <ErrorState
          title={t('stock.transfers.detail.loadFailed')}
          onRetry={() => void transfer.refetch()}
        />
      </PageContainer>
    );
  }

  const columns: ColumnDef<StockTransferLine, unknown>[] = [
    {
      id: 'product',
      header: t('stock.transfers.detail.columns.product'),
      cell: ({ row }) => (
        <span>
          <span className="block">{lineName(row.original)}</span>
          <span className="type-caption block" dir="ltr">
            {row.original.sku}
          </span>
        </span>
      ),
    },
    {
      id: 'serial',
      header: t('stock.transfers.detail.columns.serial'),
      cell: ({ row }) => <span dir="ltr">{row.original.serial ?? ''}</span>,
    },
    {
      id: 'sent',
      header: t('stock.transfers.detail.columns.sent'),
      meta: { numeric: true },
      cell: ({ row }) => formatNumber(row.original.qty_sent),
    },
    {
      id: 'received',
      header: t('stock.transfers.detail.columns.received'),
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.qty_received === null ? '' : formatNumber(row.original.qty_received),
    },
    {
      id: 'reason',
      header: t('stock.transfers.detail.columns.reason'),
      cell: ({ row }) =>
        row.original.discrepancy_reason === 'loss' || row.original.discrepancy_reason === 'damage'
          ? t(`stock.transfers.reasons.${row.original.discrepancy_reason}`)
          : '',
    },
  ];

  const when = (at: string | null, name: string | null) =>
    at ? t('stock.transfers.detail.by', { when: formatDateTime(at), name: name ?? '' }) : '';

  return (
    <PageContainer>
      <PageHeader
        title={t('stock.transfers.detail.title', { number: tr?.number ?? '' })}
        actions={
          <>
            <Link to="/inventory/transfers" className="btn btn-ghost">
              {t('stock.transfers.detail.back')}
            </Link>
            {tr?.status === 'draft' && canSend && mine.has(tr.from_branch_id) && (
              <>
                <Button variant="secondary" onClick={() => setCancelling(true)}>
                  {t('stock.transfers.detail.cancel')}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('stock.transfers.detail.edit')}
                </Button>
                <Button onClick={() => setSending(true)}>{t('stock.transfers.detail.send')}</Button>
              </>
            )}
            {tr?.status === 'sent' && canReceive && mine.has(tr.to_branch_id) && (
              <Button onClick={() => setReceiving(true)}>
                {t('stock.transfers.detail.receive')}
              </Button>
            )}
          </>
        }
      />
      {tr && (
        <Card className="mb-4 p-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="type-label">{t('stock.transfers.detail.from')}</dt>
              <dd>{tr.from_branch_name}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.transfers.detail.to')}</dt>
              <dd>{tr.to_branch_name}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.transfers.status')}</dt>
              <dd>
                <Badge tone={TRANSFER_TONE[tr.status]}>
                  {t(`stock.transfers.statuses.${tr.status}`)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.transfers.detail.created')}</dt>
              <dd>{when(tr.created_at, tr.created_by_name)}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.transfers.detail.sentAt')}</dt>
              <dd>{when(tr.sent_at, tr.sent_by_name)}</dd>
            </div>
            <div>
              <dt className="type-label">{t('stock.transfers.detail.receivedAt')}</dt>
              <dd>{when(tr.received_at, tr.received_by_name)}</dd>
            </div>
            {tr.notes && (
              <div className="sm:col-span-2">
                <dt className="type-label">{t('stock.transfers.detail.notes')}</dt>
                <dd dir="auto">{tr.notes}</dd>
              </div>
            )}
            {tr.adjustments.length > 0 && (
              <div>
                <dt className="type-label">{t('stock.transfers.detail.adjustments')}</dt>
                <dd>
                  {tr.adjustments.map((a) => (
                    <span key={a.id} className="block">
                      <span dir="ltr">{a.number}</span> ·{' '}
                      {a.reason === 'loss' || a.reason === 'damage'
                        ? t(`stock.transfers.reasons.${a.reason}`)
                        : ''}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}
      <DataTable
        caption={t('stock.transfers.detail.linesTitle', { number: tr?.number ?? '' })}
        columns={columns}
        data={tr?.lines ?? []}
        loading={transfer.isPending}
        error={transfer.isError}
        onRetry={() => void transfer.refetch()}
        getRowId={(l) => l.id}
        empty={{ title: t('stock.transfers.form.noLines') }}
      />

      {editing && tr && (
        <TransferForm
          branches={branches.data ?? []}
          destinations={destinations.data ?? []}
          transfer={tr}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
      {tr && (
        <ConfirmDialog
          open={sending}
          onOpenChange={setSending}
          title={t('stock.transfers.detail.sendTitle', { number: tr.number })}
          description={t('stock.transfers.detail.sendHelp', {
            count: formatNumber(tr.quantity_sent),
            from: tr.from_branch_name,
            to: tr.to_branch_name,
          })}
          confirmLabel={t('stock.transfers.detail.send')}
          loading={busy}
          onConfirm={() =>
            act(
              () => stockApi.sendTransfer(id),
              t('stock.transfers.detail.sent'),
              () => setSending(false),
            )
          }
        />
      )}
      {tr && (
        <ConfirmDialog
          open={cancelling}
          onOpenChange={setCancelling}
          title={t('stock.transfers.detail.cancelTitle', { number: tr.number })}
          description={t('stock.transfers.detail.cancelHelp')}
          confirmLabel={t('stock.transfers.detail.cancelConfirm')}
          cancelLabel={t('stock.transfers.detail.keep')}
          tone="danger"
          loading={busy}
          onConfirm={() =>
            act(
              () => stockApi.cancelTransfer(id),
              t('stock.transfers.detail.cancelled'),
              () => setCancelling(false),
            )
          }
        />
      )}
      {receiving && tr && (
        <ReceiveDialog transfer={tr} onClose={() => setReceiving(false)} onDone={refresh} />
      )}
    </PageContainer>
  );
}

/** What arrived, per line: everything by default; a shortage needs loss or damage. */
interface Receipt {
  received: string;
  reason: TransferDiscrepancyReason;
}

function ReceiveDialog({
  transfer,
  onClose,
  onDone,
}: {
  transfer: StockTransfer;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [receipts, setReceipts] = useState<Record<string, Receipt>>(() =>
    Object.fromEntries(
      transfer.lines.map((l) => [l.id, { received: String(l.qty_sent), reason: 'loss' as const }]),
    ),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (lineId: string, patch: Partial<Receipt>) =>
    setReceipts((r) => ({ ...r, [lineId]: { ...r[lineId]!, ...patch } }));

  async function submit() {
    setError('');
    const shortages: StockTransferReceiveLine[] = [];
    for (const l of transfer.lines) {
      const r = receipts[l.id]!;
      const qty = r.received === '' ? NaN : Number(r.received);
      if (!Number.isInteger(qty) || qty < 0 || qty > l.qty_sent) {
        setError(t('stock.transfers.errors.validation'));
        return;
      }
      if (qty < l.qty_sent) shortages.push({ line_id: l.id, qty_received: qty, reason: r.reason });
    }
    setSaving(true);
    try {
      await stockApi.receiveTransfer(transfer.id, shortages);
      notify.success(
        t(
          shortages.length
            ? 'stock.transfers.receive.receivedShort'
            : 'stock.transfers.receive.received',
        ),
      );
      onClose();
      await onDone();
    } catch (err) {
      setError(transferError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('stock.transfers.receive.title', { number: transfer.number })}
      description={t('stock.transfers.receive.help')}
      className="max-w-3xl!"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('stock.transfers.detail.keep')}
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            {t('stock.transfers.receive.submit')}
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-start">
          <caption className="sr-only">
            {t('stock.transfers.receive.title', { number: transfer.number })}
          </caption>
          <thead>
            <tr>
              <th className="type-label py-2 text-start">
                {t('stock.transfers.detail.columns.product')}
              </th>
              <th className="type-label py-2 text-start">
                {t('stock.transfers.detail.columns.sent')}
              </th>
              <th className="type-label py-2 text-start">{t('stock.transfers.receive.arrived')}</th>
              <th className="type-label py-2 text-start">{t('stock.transfers.receive.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((l) => {
              const r = receipts[l.id]!;
              const short = r.received !== '' && Number(r.received) < l.qty_sent;
              const label = `${lineName(l)}${l.serial ? ` ${l.serial}` : ''}`;
              return (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="py-2">
                    <span className="block">{lineName(l)}</span>
                    <span className="type-caption block" dir="ltr">
                      {l.serial ?? l.sku}
                    </span>
                  </td>
                  <td className="py-2">{formatNumber(l.qty_sent)}</td>
                  <td className="w-40 py-2 [&_.field-label]:sr-only">
                    {l.unit_id ? (
                      <Select
                        label={`${t('stock.transfers.receive.arrived')}: ${label}`}
                        value={r.received === '1' ? 'yes' : r.reason}
                        options={[
                          { value: 'yes', label: t('stock.transfers.receive.unitArrived') },
                          { value: 'loss', label: t('stock.transfers.receive.unitMissing') },
                          { value: 'damage', label: t('stock.transfers.receive.unitDamaged') },
                        ]}
                        onChange={(e) =>
                          e.target.value === 'yes'
                            ? set(l.id, { received: '1' })
                            : set(l.id, {
                                received: '0',
                                reason: e.target.value as TransferDiscrepancyReason,
                              })
                        }
                      />
                    ) : (
                      <NumberInput
                        label={`${t('stock.transfers.receive.arrived')}: ${label}`}
                        value={r.received}
                        decimals={0}
                        maxLength={7}
                        onValueChange={(v) => set(l.id, { received: v })}
                      />
                    )}
                  </td>
                  <td className="w-40 py-2 [&_.field-label]:sr-only">
                    {short && !l.unit_id && (
                      <Select
                        label={`${t('stock.transfers.receive.reason')}: ${label}`}
                        value={r.reason}
                        options={[
                          { value: 'loss', label: t('stock.transfers.receive.reasons.loss') },
                          { value: 'damage', label: t('stock.transfers.receive.reasons.damage') },
                        ]}
                        onChange={(e) =>
                          set(l.id, { reason: e.target.value as TransferDiscrepancyReason })
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FormError message={error} />
    </Dialog>
  );
}
