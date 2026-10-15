import { useQuery } from '@tanstack/react-query';
import type {
  CustomerContractSummary,
  CustomerScheduleLine,
  ScheduleLineStatus,
} from '@ziadkhaled-wb/contracts';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Drawer from '@/components/ui/Drawer';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBusinessDate, formatMoney, formatNumber } from '@/lib/format';
import { customerAccountApi, customerAccountKeys } from '@/services/customerAccountApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';

const LINE_TONE: Record<ScheduleLineStatus, BadgeTone> = {
  upcoming: 'neutral',
  due: 'warning',
  partly_paid: 'brand',
  overdue: 'danger',
  paid: 'success',
  closed: 'neutral',
  superseded: 'neutral',
};

const th = 'type-label px-3 py-2 text-start';
const thNum = 'type-label px-3 py-2 text-end';
const td = 'type-body px-3 py-2 text-start';
const tdNum = 'type-body whitespace-nowrap px-3 py-2 text-end';

function LineRow({ line }: { line: CustomerScheduleLine }) {
  return (
    <tr className={cn('border-b border-line', line.superseded && 'text-ink-soft')}>
      <td className={tdNum}>{formatNumber(line.seq)}</td>
      <td className={cn(td, 'whitespace-nowrap')}>{formatBusinessDate(line.due_date)}</td>
      <td className={tdNum}>
        <span className="num">{formatMoney(line.amount)}</span>
      </td>
      <td className={tdNum}>
        <span className="num">{formatMoney(line.paid)}</span>
      </td>
      <td className={tdNum}>
        <span className="num">{formatMoney(line.remaining)}</span>
      </td>
      <td className={td}>
        <Badge tone={LINE_TONE[line.status]}>
          {t(`customerAccount.schedule.status.${line.status}`)}
        </Badge>
        {line.days_late > 0 && (
          <span className="type-caption block">
            {t('customerAccount.schedule.daysLate', { count: formatNumber(line.days_late) })}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * R02 (D74): one contract's schedule, read from the server: the current lines first, then the
 * lines a reschedule replaced, and the late fees with what was waived and is still due.
 */
export default function ContractScheduleDrawer({
  customerId,
  contract,
  onClose,
}: {
  customerId: string;
  contract: CustomerContractSummary | null;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const schedule = useQuery({
    queryKey: customerAccountKeys.schedule(orgId, customerId, contract?.id ?? ''),
    queryFn: () => customerAccountApi.schedule(customerId, contract!.id),
    enabled: contract !== null,
  });
  const data = schedule.data;
  const current = (data?.lines ?? []).filter((l) => !l.superseded);
  const replaced = (data?.lines ?? []).filter((l) => l.superseded);
  const versions = [...new Set(replaced.map((l) => l.version))];

  const table = (lines: CustomerScheduleLine[], caption: string) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-paper">
          <tr>
            <th className={thNum}>{t('customerAccount.schedule.seq')}</th>
            <th className={th}>{t('customerAccount.schedule.dueDate')}</th>
            <th className={thNum}>{t('customerAccount.schedule.amount')}</th>
            <th className={thNum}>{t('customerAccount.schedule.paid')}</th>
            <th className={thNum}>{t('customerAccount.schedule.remaining')}</th>
            <th className={th}>{t('customerAccount.schedule.statusLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <LineRow key={line.id} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Drawer
      open={contract !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('customerAccount.schedule.title', { number: contract?.number ?? '' })}
      className="w-[44rem]!"
    >
      {schedule.isError ? (
        <ErrorState
          title={t(
            schedule.error instanceof ApiError && schedule.error.code === 'CONTRACT_NOT_FOUND'
              ? 'customerAccount.errors.CONTRACT_NOT_FOUND'
              : 'customerAccount.schedule.loadFailed',
          )}
          onRetry={() => void schedule.refetch()}
        />
      ) : !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-5 p-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="type-caption">{t('customerAccount.schedule.downPayment')}</dt>
              <dd className="num">{formatMoney(data.contract.down_payment)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('customerAccount.schedule.financed')}</dt>
              <dd className="num">{formatMoney(data.contract.financed_amount)}</dd>
            </div>
            <div>
              <dt className="type-caption">{t('customerAccount.schedule.markup')}</dt>
              <dd className="num">{formatMoney(data.contract.markup_amount)}</dd>
            </div>
            <div className="sm:col-span-3">
              <dd className="type-caption">
                {t('customerAccount.schedule.frequency', {
                  count: formatNumber(data.contract.installments_count),
                  frequency: t(
                    `customerAccount.schedule.frequencyName.${data.contract.frequency}` as TranslationKey,
                  ),
                })}
              </dd>
            </div>
          </dl>
          {table(current, t('customerAccount.schedule.caption'))}
          {versions.map((version) => (
            <section key={version} className="space-y-2">
              <h3 className="type-label">
                {t('customerAccount.schedule.superseded', { version: formatNumber(version) })}
              </h3>
              {table(
                replaced.filter((l) => l.version === version),
                t('customerAccount.schedule.superseded', { version: formatNumber(version) }),
              )}
            </section>
          ))}
          {data.charges.length > 0 && (
            <section className="space-y-2">
              <h3 className="type-label">{t('customerAccount.schedule.chargesTitle')}</h3>
              <ul className="divide-y divide-line">
                {data.charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {t('customerAccount.schedule.chargeLine', {
                        seq: formatNumber(c.seq),
                        date: formatBusinessDate(c.assessed_on),
                        amount: formatMoney(c.amount),
                      })}
                    </span>
                    <span className="type-caption">
                      {c.waived !== '0.00' &&
                        `${t('customerAccount.schedule.chargeWaived', { amount: formatMoney(c.waived) })} · `}
                      {t('customerAccount.schedule.chargeDue', { amount: formatMoney(c.due) })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
