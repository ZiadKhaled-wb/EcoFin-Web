import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FiscalDetails, FiscalProblem } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Drawer from '@/components/ui/Drawer';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { etaApi, etaKeys } from '@/services/etaApi';
import { fiscalApi } from '@/services/fiscalApi';
import { useQuery } from '@tanstack/react-query';
import { useCan } from '@/features/me/useCan';
import { useAuthStore } from '@/store/authStore';
import {
  FIELD_KEY,
  SITUATION_TONE,
  fiscalErrorText,
  fixLink,
  relativeTime,
} from '@/features/fiscal/fiscalText';
import { isWatching, useFiscalAction, useFiscalDetails } from '@/features/fiscal/useFiscal';
import { formatDateTime } from '@/lib/format';
import { t } from '@/i18n';

function DeadlineText({ details }: { details: FiscalDetails }) {
  const { deadline_at: at, deadline_state: state } = details.row;
  if (!at) return <>{t('fiscal.deadline.none')}</>;
  const when = relativeTime(at);
  return (
    <>
      <span className={state === 'overdue' ? 'font-medium text-danger-600' : undefined}>
        {t(state === 'overdue' ? 'fiscal.deadline.past' : 'fiscal.deadline.in', { when })}
      </span>
      {state === 'overdue' && (
        <p className="type-caption text-danger-600">{t('fiscal.deadline.late')}</p>
      )}
    </>
  );
}

function ProblemItem({ problem, saleId }: { problem: FiscalProblem; saleId: string }) {
  const link = problem.fix ? fixLink(problem.fix, problem, saleId) : null;
  const text =
    problem.code === 'NO_DEVICE'
      ? t(
          problem.reason === 'not_active'
            ? 'fiscal.problem.NO_DEVICE.not_active'
            : 'fiscal.problem.NO_DEVICE.missing',
        )
      : problem.code === 'BUYER_ID'
        ? t(
            problem.reason === 'business_tax_number'
              ? 'fiscal.problem.BUYER_ID.business_tax_number'
              : 'fiscal.problem.BUYER_ID.national_id',
          )
        : t(`fiscal.problem.${problem.code}`);
  return (
    <li className="space-y-1" data-problem={problem.code}>
      <p>{text}</p>
      {problem.products && (
        <ul className="list-disc ps-5">
          {problem.products.map((p) => (
            <li key={p.product_id}>{p.name}</li>
          ))}
        </ul>
      )}
      {problem.fields && (
        <ul className="list-disc ps-5">
          {problem.fields.map((f) => (
            <li key={f.field}>{t(FIELD_KEY[f.field])}</li>
          ))}
        </ul>
      )}
      {problem.eta_error && (
        <div className="rounded-md bg-surface-muted p-3">
          <p className="type-caption">{t('fiscal.drawer.etaError')}</p>
          <p className="font-medium">{problem.eta_error.message}</p>
          {problem.eta_error.property_path && (
            <p className="type-caption">
              {t('fiscal.drawer.property')}:{' '}
              <span className="num" dir="ltr">
                {problem.eta_error.property_path}
              </span>
            </p>
          )}
          {problem.eta_error.details.length > 0 && (
            <ul className="list-disc ps-5">
              {problem.eta_error.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {problem.fixable && problem.fix && link && (
        <Link className="btn-link" to={link}>
          {t(`fiscal.fix.${problem.fix}`)}
        </Link>
      )}
      {!problem.fixable && <Badge tone="danger">{t('fiscal.fix.support')}</Badge>}
    </li>
  );
}

function AssignDeviceDialog({
  open,
  onOpenChange,
  branchId,
  onAssign,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  onAssign: (deviceId: string) => void;
  busy: boolean;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const devices = useQuery({
    queryKey: etaKeys.devices(orgId),
    queryFn: () => etaApi.devices(),
    enabled: open,
  });
  const choices = (devices.data ?? []).filter((d) => d.branch_id === branchId && d.is_active);
  const [chosen, setChosen] = useState('');
  const device = chosen || choices[0]?.id || '';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('fiscal.assign.title')}
      description={t('fiscal.assign.description')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('fiscal.assign.cancel')}
          </Button>
          <Button disabled={!device} loading={busy} onClick={() => onAssign(device)}>
            {t('fiscal.assign.confirm')}
          </Button>
        </>
      }
    >
      {choices.length === 0 ? (
        <p>{t('fiscal.assign.none')}</p>
      ) : (
        <Select
          label={t('fiscal.assign.device')}
          value={device}
          onChange={(e) => setChosen(e.target.value)}
          options={choices.map((d) => ({ value: d.id, label: d.name }))}
        />
      )}
    </Dialog>
  );
}

/** One receipt: its situation, what is wrong with it (in plain words, with the fix), its history and its one action. */
export default function FiscalDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const canAct = useCan('fiscal.retry');
  // When "Correct and resend" was pressed (ms). The drawer is keyed by receipt, so each starts fresh.
  const [watchStart, setWatchStart] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const details = useFiscalDetails(id, watchStart);
  const data = details.data;
  const watching = isWatching(data, watchStart, details.dataUpdatedAt);

  const correct = useFiscalAction((rowId: string) => fiscalApi.correct(rowId));
  const retry = useFiscalAction((rowId: string) => fiscalApi.retry(rowId));
  const check = useFiscalAction((rowId: string) => fiscalApi.checkNow(rowId));
  const assign = useFiscalAction((v: { id: string; deviceId: string }) =>
    fiscalApi.assignDevice(v.id, v.deviceId),
  );

  const action = data?.diagnosis.action ?? null;
  const queued = watching || (data?.diagnosis.correction_queued ?? false);
  const ready = (data?.diagnosis.ready ?? false) && !queued;
  const nothingChanged =
    data?.diagnosis.problems.some((p) => p.eta_error?.nothing_changed) ?? false;

  function run() {
    if (!id || !action) return;
    if (action === 'assign_device') {
      setAssigning(true);
      return;
    }
    const done = {
      onError: (e: unknown) => notify.error(fiscalErrorText(e)),
    };
    if (action === 'correct') {
      correct.mutate(id, {
        ...done,
        onSuccess: () => {
          setWatchStart(Date.now());
          notify.success(t('fiscal.queued'));
        },
      });
    } else if (action === 'check_now') {
      check.mutate(id, { ...done, onSuccess: () => notify.success(t('fiscal.checkQueued')) });
    } else {
      retry.mutate(id, { ...done, onSuccess: () => notify.success(t('fiscal.retried')) });
    }
  }

  const busy = correct.isPending || retry.isPending || check.isPending;
  return (
    <Drawer
      open={id !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('fiscal.drawer.title', { sale: data?.row.sale_number ?? '' })}
      side="end"
      className="w-[28rem]"
    >
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {details.isPending && <LoadingState />}
        {details.isError && (
          <ErrorState
            title={t('fiscal.drawer.loadFailed')}
            onRetry={() => void details.refetch()}
          />
        )}
        {data && (
          <>
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge tone={SITUATION_TONE[data.situation]}>
                  {t(`fiscal.situation.${data.situation}`)}
                </Badge>
                <Link className="btn-link" to={`/sales/${data.sale.id}`}>
                  {t('fiscal.drawer.openSale')} {data.sale.number}
                </Link>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="type-caption">{t('fiscal.drawer.deadline')}</dt>
                <dd>
                  <DeadlineText details={data} />
                </dd>
                <dt className="type-caption">{t('fiscal.drawer.uuid')}</dt>
                <dd className="num break-all" dir="ltr">
                  {data.row.eta_uuid ?? '-'}
                </dd>
                {data.row.reference_old_uuid && (
                  <>
                    <dt className="type-caption">{t('fiscal.drawer.replaced')}</dt>
                    <dd className="num break-all" dir="ltr">
                      {data.row.reference_old_uuid}
                    </dd>
                  </>
                )}
                <dt className="type-caption">{t('fiscal.drawer.attempts')}</dt>
                <dd>{data.row.attempts}</dd>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="type-section-title">{t('fiscal.drawer.problems')}</h3>
              {data.diagnosis.problems.length === 0 ? (
                <p>{t('fiscal.drawer.noProblems')}</p>
              ) : (
                <ul className="space-y-4">
                  {data.diagnosis.problems.map((p) => (
                    <ProblemItem key={p.code} problem={p} saleId={data.sale.id} />
                  ))}
                </ul>
              )}
            </section>

            {action && canAct ? (
              <section className="space-y-2">
                <Button onClick={run} disabled={!ready} loading={busy || queued}>
                  {t(`fiscal.action.${action}`)}
                </Button>
                {queued && <Notice tone="info">{t('fiscal.hint.correctionQueued')}</Notice>}
                {!queued && !ready && <p className="type-caption">{t('fiscal.hint.notReady')}</p>}
                {!queued && nothingChanged && (
                  <Notice tone="error">{t('fiscal.hint.nothingChanged')}</Notice>
                )}
              </section>
            ) : (
              <p className="type-caption">{t('fiscal.hint.nothingToDo')}</p>
            )}

            <section className="space-y-2">
              <h3 className="type-section-title">{t('fiscal.drawer.timeline')}</h3>
              {data.events.length === 0 ? (
                <p>{t('fiscal.drawer.noEvents')}</p>
              ) : (
                <ol className="space-y-3 border-s border-line ps-4">
                  {data.events.map((e) => (
                    <li key={e.id}>
                      <p className="type-caption">
                        {formatDateTime(e.at)} ·{' '}
                        {e.actor_employee_id ? t('fiscal.drawer.actor') : t('fiscal.drawer.system')}
                      </p>
                      <p>
                        {e.old_status ? `${e.old_status} → ` : ''}
                        {e.new_status}
                      </p>
                      {e.eta_uuid && (
                        <p className="num break-all text-xs" dir="ltr">
                          {e.eta_uuid}
                        </p>
                      )}
                      {e.message && <p className="type-caption break-words">{e.message}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <AssignDeviceDialog
              open={assigning}
              onOpenChange={setAssigning}
              branchId={data.row.branch_id}
              busy={assign.isPending}
              onAssign={(deviceId) =>
                assign.mutate(
                  { id: data.row.id, deviceId },
                  {
                    onSuccess: () => {
                      setAssigning(false);
                      notify.success(t('fiscal.retried'));
                    },
                    onError: (e) => notify.error(fiscalErrorText(e)),
                  },
                )
              }
            />
          </>
        )}
      </div>
    </Drawer>
  );
}
