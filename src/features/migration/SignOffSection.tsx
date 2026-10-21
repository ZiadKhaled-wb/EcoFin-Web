import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MigrationSignOffBody, type MigrationReportBatch } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import FormError from '@/components/ui/FormError';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { formatDateTime, formatMoney } from '@/lib/format';
import { migrationApi, migrationKeys } from '@/services/migrationApi';
import { useAuthStore } from '@/store/authStore';
import { canSign, isAmount, migrationErrorText } from './migrationShared';

const th = 'type-label px-3 py-2 text-start';
const td = 'type-body px-3 py-2 text-start';

/**
 * The owner signs the reconciliation against the total of the old records (import.data). The
 * server compares it with what the batches imported and refuses ANY difference, showing expected /
 * system / difference. The scan of the signed paper can be attached.
 */
export default function SignOffSection({ batches }: { batches: MigrationReportBatch[] }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const open = batches.filter(canSign);
  const [chosen, setChosen] = useState<string[]>([]);
  const [openTotal, setOpenTotal] = useState('');
  const [cashTotal, setCashTotal] = useState('');
  const [note, setNote] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);
  const list = useQuery({
    queryKey: migrationKeys.signOffs(orgId),
    queryFn: () => migrationApi.signOffs(),
  });

  async function submit() {
    if (posting.current) return;
    setError('');
    const next: Record<string, string> = {};
    if (!isAmount(openTotal)) next['open'] = t('migration.signOff.amountInvalid');
    if (cashTotal.trim() !== '' && !isAmount(cashTotal)) {
      next['cash'] = t('migration.signOff.amountInvalid');
    }
    if (chosen.length === 0) next['batches'] = t('migration.signOff.batchesRequired');
    if (note.trim().length < 3) next['note'] = t('migration.signOff.noteRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    posting.current = true;
    setBusy(true);
    try {
      const signed_file_id = scan ? (await migrationApi.uploadScan(scan)).id : undefined;
      const body = MigrationSignOffBody.parse({
        expected_open_total: openTotal.trim(),
        ...(cashTotal.trim() !== '' ? { expected_cash_total: cashTotal.trim() } : {}),
        batch_ids: chosen,
        note: note.trim(),
        ...(signed_file_id ? { signed_file_id } : {}),
      });
      await migrationApi.signOff(body);
      await cache.invalidateQueries({ queryKey: migrationKeys.all(orgId) });
      notify.success(t('migration.signOff.done'));
      setChosen([]);
      setOpenTotal('');
      setCashTotal('');
      setNote('');
      setScan(null);
      posting.current = false;
      setBusy(false);
    } catch (err) {
      posting.current = false;
      setBusy(false);
      setError(migrationErrorText(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card title={t('migration.signOff.title')} description={t('migration.signOff.description')}>
        {open.length === 0 ? (
          <p>{t('migration.signOff.nothing')}</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            noValidate
          >
            <fieldset className="space-y-1">
              <legend className="type-label">{t('migration.signOff.batches')}</legend>
              {open.map((b) => (
                <Checkbox
                  key={b.id}
                  checked={chosen.includes(b.id)}
                  onChange={(e) =>
                    setChosen((prev) =>
                      e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                    )
                  }
                  label={`${t(`migration.kinds.${b.kind}`)} · ${b.file_name ?? ''}`}
                  description={
                    b.kind === 'opening_contracts'
                      ? t('migration.signOff.batchContracts', {
                          count: b.contracts,
                          total: formatMoney(b.imported_total),
                        })
                      : t('migration.signOff.batchCash', { total: formatMoney(b.cash_total) })
                  }
                />
              ))}
              {errors['batches'] && (
                <p role="alert" className="type-caption text-danger-600">
                  {errors['batches']}
                </p>
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                aria-label={t('migration.signOff.openTotal')}
                placeholder={t('migration.signOff.openTotal')}
                inputMode="decimal"
                ltr
                value={openTotal}
                onChange={(e) => setOpenTotal(e.target.value)}
                invalid={!!errors['open']}
              />
              <Input
                aria-label={t('migration.signOff.cashTotal')}
                placeholder={t('migration.signOff.cashTotal')}
                inputMode="decimal"
                ltr
                value={cashTotal}
                onChange={(e) => setCashTotal(e.target.value)}
                invalid={!!errors['cash']}
              />
            </div>
            {(errors['open'] || errors['cash']) && (
              <p role="alert" className="type-caption text-danger-600">
                {errors['open'] ?? errors['cash']}
              </p>
            )}
            <p className="type-caption">{t('migration.signOff.help')}</p>
            <Textarea
              label={t('migration.signOff.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              required
              error={errors['note']}
            />
            <div>
              <label className="type-label block" htmlFor="migration-scan">
                {t('migration.signOff.scan')}
              </label>
              <input
                id="migration-scan"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setScan(e.target.files?.[0] ?? null)}
              />
            </div>
            <FormError message={error} />
            <Button type="submit" loading={busy} disabled={busy}>
              {t('migration.signOff.submit')}
            </Button>
          </form>
        )}
      </Card>

      <Card title={t('migration.signOff.listTitle')} padded={false}>
        {(list.data?.items.length ?? 0) === 0 ? (
          <p className="p-6">{t('migration.signOff.listEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <caption className="sr-only">{t('migration.signOff.listTitle')}</caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th className={th}>{t('migration.signOff.signedAt')}</th>
                  <th className={th}>{t('migration.signOff.signedBy')}</th>
                  <th className={th}>{t('migration.signOff.openTotal')}</th>
                  <th className={th}>{t('migration.signOff.cashTotal')}</th>
                  <th className={th}>{t('migration.signOff.note')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data?.items.map((s) => (
                  <tr key={s.id}>
                    <td className={td}>{formatDateTime(s.signed_at)}</td>
                    <td className={td}>{s.signed_by?.name ?? ''}</td>
                    <td className={td + ' num'}>{formatMoney(s.system_open_total)}</td>
                    <td className={td + ' num'}>{formatMoney(s.system_cash_total)}</td>
                    <td className={td}>{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
