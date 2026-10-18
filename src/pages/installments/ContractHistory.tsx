import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContractChange } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { formatBusinessDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { contractChangeKeys, contractChangesApi } from '@/services/contractChangesApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';

/** What a change did, in one line: the amount it carried and the profit waived. */
function changeSummary(c: ContractChange) {
  if (c.kind === 'early_settlement') {
    return t('contractChanges.history.settled', {
      amount: formatMoney(c.amount ?? '0.00'),
      waived: formatMoney(c.profit_waived),
    });
  }
  if (c.kind === 'write_off') {
    return t('contractChanges.history.writtenOff', { amount: formatMoney(c.amount ?? '0.00') });
  }
  return t('contractChanges.history.rescheduled', {
    amount: formatMoney(c.amount ?? '0.00'),
    version: formatNumber(c.new_version ?? 0),
  });
}

/**
 * N05 (D80): the contract's changes (early settlement, reschedules, write-off) and every schedule
 * version: nothing is overwritten, so an old schedule stays visible, marked superseded and linked
 * to the change that replaced it. Shown only when the reader may see it (the server decides).
 */
export default function ContractHistory({
  contractId,
  currentVersion,
}: {
  contractId: string;
  currentVersion: number;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const history = useQuery({
    queryKey: contractChangeKeys.history(orgId, contractId),
    queryFn: () => contractChangesApi.history(contractId),
    retry: false,
  });
  const [picked, setPicked] = useState<number | null>(null);
  const h = history.data;
  if (!h || h.changes.length === 0) return null;

  const version = picked ?? currentVersion;
  const shown = h.versions.find((v) => v.version === version) ?? h.versions[0];
  const changeOf = (id: string | null) => h.changes.find((c) => c.id === id);

  return (
    <>
      <Card title={t('contractChanges.history.title')}>
        <ul className="space-y-3">
          {h.changes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Badge tone={c.kind === 'write_off' ? 'danger' : 'neutral'}>
                  {t(`contractChanges.kind.${c.kind}`)}
                </Badge>
                <span className="type-body ms-2">{changeSummary(c)}</span>
                <p className="type-caption mt-1" dir="auto">
                  {c.reason}
                </p>
              </div>
              <div className="type-caption text-end">
                <div>{formatDateTime(c.created_at)}</div>
                {c.created_by.name && <bdi>{c.created_by.name}</bdi>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {shown && (
        <Card title={t('contractChanges.history.versions')} padded={false}>
          <div className="flex flex-wrap items-end gap-4 px-4 pt-4">
            <div className="w-64">
              <Select
                label={t('contractChanges.history.version')}
                options={h.versions.map((v) => ({
                  value: String(v.version),
                  label: t(
                    v.superseded
                      ? 'contractChanges.history.versionOld'
                      : 'contractChanges.history.versionCurrent',
                    { version: formatNumber(v.version) },
                  ),
                }))}
                value={String(shown.version)}
                onChange={(e) => setPicked(Number(e.target.value))}
              />
            </div>
            {shown.superseded && (
              <p className="type-caption pb-2" data-testid="superseded-note">
                {t('contractChanges.history.supersededBy', {
                  kind: t(
                    `contractChanges.kind.${
                      changeOf(
                        h.versions.find((v) => v.version === shown.version + 1)?.change_id ?? null,
                      )?.kind ?? 'reschedule'
                    }`,
                  ),
                })}
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table
              className={`mt-4 w-full border-collapse text-start ${shown.superseded ? 'text-ink-mute' : ''}`}
            >
              <caption className="sr-only">
                {t('contractChanges.history.versionCaption', {
                  version: formatNumber(shown.version),
                })}
              </caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th className={th}>{t('installments.schedule.seq')}</th>
                  <th className={th}>{t('installments.schedule.due')}</th>
                  <th className={thNum}>{t('installments.schedule.amount')}</th>
                  <th className={thNum}>{t('installments.schedule.principal')}</th>
                  <th className={thNum}>{t('installments.schedule.profit')}</th>
                  <th className={thNum}>{t('installments.contract.paid')}</th>
                  <th className={th}>{t('installments.contract.status')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.lines.map((l) => (
                  <tr key={l.seq} className="border-b border-line">
                    <td className={tdNum}>{formatNumber(l.seq)}</td>
                    <td className={td}>{formatBusinessDate(l.due_date)}</td>
                    <td className={tdNum}>{formatMoney(l.amount)}</td>
                    <td className={tdNum}>{formatMoney(l.principal)}</td>
                    <td className={tdNum}>{formatMoney(l.profit)}</td>
                    <td className={tdNum}>{formatMoney(l.paid)}</td>
                    <td className={td}>{t(`customerAccount.schedule.status.${l.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
