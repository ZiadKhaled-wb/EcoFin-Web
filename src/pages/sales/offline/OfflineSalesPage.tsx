import { useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OFFLINE_SALE_STATUSES,
  OfflineImportBody,
  OfflineItem,
  type OfflineAction,
  type OfflineSaleDetail,
  type OfflineSaleStatus,
} from '@ziadkhaled-wb/contracts';
import { z } from 'zod';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormField from '@/components/ui/FormField';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getLanguage, t } from '@/i18n';
import { etaApi, etaKeys } from '@/services/etaApi';
import { offlineApi, offlineKeys } from '@/services/offlineApi';
import { useAuthStore } from '@/store/authStore';
import { offlineError, offlineReason } from './offlineShared';

const TONES: Record<OfflineSaleStatus, BadgeTone> = {
  received: 'neutral',
  posted: 'success',
  conflict: 'warning',
  duplicate: 'neutral',
  rejected: 'danger',
};
const UUID = z.string().uuid();

const lineName = (l: { name_ar: string | null; name_en: string | null; sku: string | null }) =>
  (getLanguage() === 'en' && l.name_en ? l.name_en : l.name_ar) ?? l.sku ?? '';

/**
 * S08 (§5.7, D11, D13): the offline sales of the manager's shop: what was posted and what waits
 * for a decision, with the printed lines, the D11 actions (each with a reason) and the import of
 * a device's export file. The server checks offline.resolve and the branch on every call.
 */
export default function OfflineSalesPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const [status, setStatus] = useState<OfflineSaleStatus | ''>('conflict');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = status ? { status } : {};
  const list = useQuery({
    queryKey: offlineKeys.list(orgId, query),
    queryFn: () => offlineApi.list(query),
  });

  return (
    <PageContainer>
      <PageHeader title={t('offline.review.title')} description={t('offline.review.description')} />
      <div className="space-y-4">
        <div className="max-w-xs">
          <Select
            label={t('offline.review.status')}
            value={status}
            options={[
              { value: '', label: t('offline.review.statuses.all') },
              ...OFFLINE_SALE_STATUSES.map((s) => ({
                value: s,
                label: t(`offline.review.statuses.${s}`),
              })),
            ]}
            onChange={(e) => setStatus(e.target.value as OfflineSaleStatus | '')}
            data-testid="offline-status-filter"
          />
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState title={t('offline.review.empty')} />
        ) : (
          <ul className="space-y-2" data-testid="offline-sales">
            {list.data.map((sale) => (
              <li key={sale.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="type-body font-semibold" dir="ltr">
                        {sale.number}
                      </p>
                      <p className="type-caption">
                        {sale.device_name ?? ''} · {sale.cashier_name ?? ''} ·{' '}
                        {formatDateTime(sale.issued_at)}
                      </p>
                      {offlineReason(sale) && <p className="type-caption">{offlineReason(sale)}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num">{formatMoney(sale.total)}</span>
                      <Badge tone={TONES[sale.status]}>
                        {t(`offline.review.statuses.${sale.status}`)}
                      </Badge>
                      <Button variant="secondary" size="sm" onClick={() => setOpenId(sale.id)}>
                        {t('offline.review.open')}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <ImportCard />
      </div>
      {openId && <OfflineSaleDialog id={openId} onClose={() => setOpenId(null)} />}
    </PageContainer>
  );
}

/** One offline sale as printed, with the actions its code allows (D11). */
export function OfflineSaleDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const sale = useQuery({
    queryKey: offlineKeys.one(orgId, id),
    queryFn: () => offlineApi.get(id),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={sale.data?.number ?? t('offline.review.title')}
      className="max-w-2xl"
    >
      {sale.isPending ? (
        <LoadingState />
      ) : sale.isError ? (
        <ErrorState description={offlineError(sale.error)} onRetry={() => void sale.refetch()} />
      ) : (
        <OfflineSaleBody sale={sale.data} onDone={onClose} />
      )}
    </Dialog>
  );
}

export function OfflineSaleBody({ sale, onDone }: { sale: OfflineSaleDetail; onDone: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [action, setAction] = useState<OfflineAction | ''>(sale.actions[0] ?? '');
  const [reason, setReason] = useState('');
  const [units, setUnits] = useState<Record<string, string>>({});
  const [shiftId, setShiftId] = useState('');
  const [error, setError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!action || busy) return;
    setError('');
    setReasonError('');
    const text = reason.trim();
    if (text.length < 3) return setReasonError(t('offline.errors.REASON_REQUIRED'));
    const unitIds = Object.fromEntries(Object.entries(units).filter(([, v]) => v.trim() !== ''));
    if (
      action === 'use_serial' &&
      !Object.values(unitIds).every((v) => UUID.safeParse(v.trim()).success)
    ) {
      return setError(t('offline.errors.VALIDATION_FAILED'));
    }
    if (action === 'post_to_shift' && !UUID.safeParse(shiftId.trim()).success) {
      return setError(t('offline.errors.SHIFT_NOT_FOUND'));
    }
    setBusy(true);
    try {
      await offlineApi.resolve(sale.id, {
        action,
        reason: text,
        ...(action === 'use_serial'
          ? { unit_ids: Object.fromEntries(Object.entries(unitIds).map(([k, v]) => [k, v.trim()])) }
          : {}),
        ...(action === 'post_to_shift' ? { shift_id: shiftId.trim() } : {}),
      });
      notify.success(t('offline.review.done'));
      await cache.invalidateQueries({ queryKey: offlineKeys.all(orgId) });
      onDone();
    } catch (err) {
      setError(offlineError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="offline-sale-detail">
      <dl className="type-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>{t('offline.review.status')}</dt>
        <dd>
          <Badge tone={TONES[sale.status]}>{t(`offline.review.statuses.${sale.status}`)}</Badge>
        </dd>
        {offlineReason(sale) && (
          <>
            <dt>{t('offline.review.code')}</dt>
            <dd data-testid="offline-sale-code">{offlineReason(sale)}</dd>
          </>
        )}
        <dt>{t('offline.review.device')}</dt>
        <dd>{sale.device_name ?? ''}</dd>
        <dt>{t('offline.review.cashier')}</dt>
        <dd>{sale.cashier_name ?? ''}</dd>
        <dt>{t('offline.review.issuedAt')}</dt>
        <dd>{formatDateTime(sale.issued_at)}</dd>
      </dl>
      <section className="space-y-2">
        <h3 className="type-section-title">{t('offline.review.lines')}</h3>
        <ul className="space-y-1">
          {sale.lines.map((l) => (
            <li key={l.line_no} className="flex flex-wrap justify-between gap-2">
              <span>
                {l.line_no}. {lineName(l)}
                {l.serial ? ` (${l.serial})` : ''} × {l.quantity}
              </span>
              <span className="num">{formatMoney(l.line_total)}</span>
            </li>
          ))}
        </ul>
        <p className="type-body font-semibold">
          {t('offline.review.total')}: <span className="num">{formatMoney(sale.total)}</span>
        </p>
        <p className="type-caption">
          {t('offline.review.payment', {
            tendered: formatMoney(sale.payment.tendered),
            change: formatMoney(sale.payment.change),
          })}
        </p>
      </section>
      {sale.actions.length === 0 ? (
        <p className="type-caption" data-testid="offline-no-actions">
          {t('offline.review.noActions')}
        </p>
      ) : (
        <section className="space-y-3" data-testid="offline-actions">
          <Select
            label={t('offline.review.submit')}
            value={action}
            options={sale.actions.map((a) => ({
              value: a,
              label: t(`offline.review.actions.${a}`),
            }))}
            onChange={(e) => setAction(e.target.value as OfflineAction)}
            data-testid="offline-action"
          />
          {action === 'use_serial' &&
            sale.lines
              .filter((l) => l.unit_id)
              .map((l) => (
                <FormField
                  key={l.line_no}
                  label={t('offline.review.unitFor', { line: l.line_no })}
                  ltr
                  value={units[String(l.line_no)] ?? ''}
                  onChange={(e) => setUnits((u) => ({ ...u, [String(l.line_no)]: e.target.value }))}
                  data-testid={`offline-unit-${l.line_no}`}
                />
              ))}
          {action === 'post_to_shift' && (
            <FormField
              label={t('offline.review.shiftId')}
              ltr
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
            />
          )}
          <Textarea
            label={t('offline.review.reason')}
            help={t('offline.review.reasonHelp')}
            value={reason}
            maxLength={500}
            rows={2}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
            data-testid="offline-reason"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button loading={busy} onClick={() => void submit()} data-testid="offline-resolve">
            {t('offline.review.submit')}
          </Button>
        </section>
      )}
    </div>
  );
}

/** D13: a device's export file, imported for that device. */
function ImportCard() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const devices = useQuery({
    queryKey: etaKeys.devices(orgId),
    queryFn: etaApi.devices,
    retry: false,
  });
  const [deviceId, setDeviceId] = useState('');
  const [items, setItems] = useState<OfflineItem[] | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    setError('');
    setResult('');
    setItems(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = z
        .array(OfflineItem)
        .min(1)
        .safeParse(JSON.parse(await file.text()));
      if (!parsed.success) return setError(t('offline.review.import.invalid'));
      setItems(parsed.data);
    } catch {
      setError(t('offline.review.import.invalid'));
    }
  }

  async function submit() {
    const body = OfflineImportBody.safeParse({ device_id: deviceId.trim(), items });
    if (!body.success) return setError(t('offline.errors.VALIDATION_FAILED'));
    setBusy(true);
    setError('');
    try {
      const answer = await offlineApi.importItems(body.data);
      const count = (r: string) => answer.results.filter((x) => x.result === r).length;
      setResult(
        t('offline.review.import.result', {
          received: count('received'),
          duplicate: count('duplicate'),
          rejected: count('rejected'),
        }),
      );
      await cache.invalidateQueries({ queryKey: offlineKeys.all(orgId) });
    } catch (err) {
      setError(offlineError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <div className="space-y-3" data-testid="offline-import">
        <h2 className="type-section-title">{t('offline.review.import.title')}</h2>
        {devices.data ? (
          <Select
            label={t('offline.review.import.device')}
            value={deviceId}
            placeholder={t('offline.review.import.device')}
            options={devices.data.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(e) => setDeviceId(e.target.value)}
          />
        ) : (
          <FormField
            label={t('offline.review.import.device')}
            ltr
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
        )}
        <FormField
          label={t('offline.review.import.file')}
          type="file"
          accept="application/json,.json"
          onChange={(e) => void pick(e)}
        />
        {error && <Notice tone="error">{error}</Notice>}
        {result && <Notice tone="success">{result}</Notice>}
        <Button loading={busy} disabled={!items || deviceId === ''} onClick={() => void submit()}>
          {t('offline.review.import.submit')}
        </Button>
      </div>
    </Card>
  );
}
