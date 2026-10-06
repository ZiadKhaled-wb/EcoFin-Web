import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SubscriptionDatesBody,
  SubscriptionPlanBody,
  SubscriptionPaymentBody,
  PlanDowngradeDetail,
  type AdminSubscription,
} from '@ziadkhaled-wb/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import DataTable from '@/components/ui/DataTable';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/services/shopApi';
import { subscriptionApi } from '@/services/subscriptionApi';
import { shopError } from './shopErrors';

export default function SubscriptionPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['admin-subscription', id],
    queryFn: () => subscriptionApi.adminStatus(id!),
    enabled: !!id,
  });
  if (query.isPending) return <p role="status">{t('subscriptions.loading')}</p>;
  if (query.isError || !id) return <p role="alert">{t('errors.unknown')}</p>;
  return <SubscriptionPanel id={id} data={query.data} />;
}
function SubscriptionPanel({ id, data }: { id: string; data: AdminSubscription }) {
  const cache = useQueryClient();
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: adminApi.plans });
  const [plan, setPlan] = useState(data.plan_key);
  const [planReason, setPlanReason] = useState('');
  const [start, setStart] = useState(data.subscription_start ?? '');
  const [end, setEnd] = useState(data.subscription_end ?? '');
  const [noEnd, setNoEnd] = useState(data.subscription_end === null);
  const [datesReason, setDatesReason] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentKey, setPaymentKey] = useState('');
  const [amount, setAmount] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reference, setReference] = useState('');
  const [extend, setExtend] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState<ReturnType<typeof PlanDowngradeDetail.parse>>([]);
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['admin-subscription', id] }),
      cache.invalidateQueries({ queryKey: ['admin-shops'] }),
      cache.invalidateQueries({ queryKey: ['subscription', id] }),
    ]);
  };
  async function save(kind: 'plan' | 'dates' | 'payment', event: FormEvent) {
    event.preventDefault();
    setError('');
    setOver([]);
    const parsed =
      kind === 'plan'
        ? SubscriptionPlanBody.safeParse({ plan_key: plan, reason: planReason })
        : kind === 'dates'
          ? SubscriptionDatesBody.safeParse({ start, end: noEnd ? null : end, reason: datesReason })
          : SubscriptionPaymentBody.safeParse({
              amount,
              period_start: periodStart,
              period_end: periodEnd,
              reference: reference || undefined,
              extend,
            });
    if (!parsed.success) {
      setError(t('subscriptions.validation'));
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'plan') await subscriptionApi.plan(id, SubscriptionPlanBody.parse(parsed.data));
      else if (kind === 'dates')
        await subscriptionApi.dates(id, SubscriptionDatesBody.parse(parsed.data));
      else {
        await subscriptionApi.payment(id, SubscriptionPaymentBody.parse(parsed.data), paymentKey);
        setPaymentOpen(false);
      }
      await refresh();
      notify.success(t('subscriptions.saved'));
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'PLAN_DOWNGRADE_BLOCKED') {
        const details = PlanDowngradeDetail.safeParse(failure.details);
        if (details.success) setOver(details.data);
        setError(t('subscriptions.downgradeBlocked'));
      } else setError(shopError(failure));
    } finally {
      setBusy(null);
    }
  }
  const columns: ColumnDef<AdminSubscription['payments'][number], unknown>[] = [
    { accessorKey: 'amount', header: t('subscriptions.amount') },
    { accessorKey: 'period_start', header: t('subscriptions.periodStart') },
    { accessorKey: 'period_end', header: t('subscriptions.periodEnd') },
    { accessorKey: 'paid_at', header: t('subscriptions.paidAt') },
    { accessorKey: 'reference', header: t('subscriptions.reference') },
  ];
  return (
    <PageContainer>
      <PageHeader
        title={t('subscriptions.title')}
        actions={
          <Link className="btn-link" to="/admin">
            {t('subscriptions.back')}
          </Link>
        }
      />
      <div className="space-y-6">
        <section className="rounded-panel border border-line bg-surface p-5 space-y-3">
          <h2 className="type-section-title">{data.plan.name}</h2>
          <Badge
            tone={
              data.state === 'expired'
                ? 'danger'
                : data.state === 'expiring'
                  ? 'warning'
                  : 'success'
            }
          >
            {t(`subscriptions.states.${data.state}`)}
          </Badge>
          <p>
            {t('subscriptions.start')}: {data.subscription_start ?? t('subscriptions.noEnd')}
          </p>
          <p>
            {t('subscriptions.end')}: {data.subscription_end ?? t('subscriptions.noEnd')}
          </p>
          {data.days_left !== null && (
            <p>
              {t('subscriptions.daysLeft')}: {data.days_left}
            </p>
          )}
          <h3>{t('subscriptions.usage')}</h3>
          {(['branches', 'users', 'devices'] as const).map((resource) => {
            const usage = data.usage[resource];
            return (
              <div key={resource} className="space-y-1">
                <p>
                  {t(`subscriptions.resources.${resource}`)}: {usage.used} /{' '}
                  {usage.limit ?? t('subscriptions.unlimited')}
                </p>
                <progress
                  aria-label={t(`subscriptions.resources.${resource}`)}
                  value={usage.used}
                  max={usage.limit ?? Math.max(usage.used, 1)}
                  className="w-full"
                />
              </div>
            );
          })}
        </section>
        <FormError message={error} />
        {!!over.length && (
          <ul role="alert">
            {over.map((row) => (
              <li key={row.resource}>
                {t('subscriptions.overLimit', {
                  resource: t(`subscriptions.resources.${row.resource}`),
                  used: row.used,
                  limit: row.limit,
                })}
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => void save('plan', e)}
          className="grid gap-3 rounded-panel border border-line bg-surface p-5"
        >
          <Select
            label={t('subscriptions.newPlan')}
            value={plan}
            disabled={!plans.data}
            onChange={(e) => setPlan(e.target.value)}
            options={(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))}
          />
          <FormField
            label={t('subscriptions.planReason')}
            value={planReason}
            onChange={(e) => setPlanReason(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy !== null || !plans.data}>
            {t('subscriptions.savePlan')}
          </Button>
        </form>
        <form
          onSubmit={(e) => void save('dates', e)}
          className="grid gap-3 rounded-panel border border-line bg-surface p-5"
        >
          <FormField
            label={t('subscriptions.start')}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
          <label className="flex gap-2">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
            {t('subscriptions.noEnd')}
          </label>
          <FormField
            label={t('subscriptions.end')}
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={noEnd}
            required={!noEnd}
          />
          <FormField
            label={t('subscriptions.datesReason')}
            value={datesReason}
            onChange={(e) => setDatesReason(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy !== null}>
            {t('subscriptions.saveDates')}
          </Button>
        </form>
        <Button
          onClick={() => {
            setPaymentKey(crypto.randomUUID());
            setAmount('');
            setPeriodStart('');
            setPeriodEnd('');
            setReference('');
            setExtend(true);
            setError('');
            setPaymentOpen(true);
          }}
        >
          {t('subscriptions.recordPayment')}
        </Button>
        <DataTable
          caption={t('subscriptions.payments')}
          data={data.payments}
          columns={columns}
          getRowId={(row) => row.id}
        />
      </div>
      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          if (busy !== 'payment') setPaymentOpen(open);
        }}
        title={t('subscriptions.recordPayment')}
      >
        <form onSubmit={(e) => void save('payment', e)} className="space-y-3">
          <FormField
            label={t('subscriptions.amount')}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <FormField
            label={t('subscriptions.periodStart')}
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            required
          />
          <FormField
            label={t('subscriptions.periodEnd')}
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            required
          />
          <FormField
            label={t('subscriptions.reference')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <label className="flex gap-2">
            <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} />
            {t('subscriptions.extend')}
          </label>
          <FormError message={error} />
          <Button type="submit" disabled={busy !== null}>
            {t('subscriptions.savePayment')}
          </Button>
        </form>
      </Dialog>
    </PageContainer>
  );
}
