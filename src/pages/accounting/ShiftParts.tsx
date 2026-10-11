import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SHIFT_DENOMINATIONS,
  shiftCountTotal,
  type Shift,
  type ShiftCounts,
  type ShiftMovement,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cashKeys } from '@/services/cashApi';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { isZero } from './cashShared';
import { moneyDifference, movementLabel, shiftError } from './shiftShared';

const th = 'type-label px-4 py-3 text-start';
const thNum = 'type-label px-4 py-3 text-end';
const td = 'type-body px-4 py-3 text-start';
const tdNum = 'type-body whitespace-nowrap px-4 py-3 text-end';
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

function useRefreshShifts() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: shiftKeys.all(orgId) }),
      cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
    ]);
}

/** The safes of a branch (names only), for a float, a drop or the closing. */
function useVaults(branchId: string, enabled = true) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: shiftKeys.vaults(orgId, branchId),
    queryFn: () => shiftsApi.vaults(branchId),
    enabled: enabled && branchId !== '',
  });
}

/** The drawer ledger of a shift, oldest first. */
/** S02: what the shift took: its sales and the payments by method. */
export function ShiftTakings({ shift }: { shift: Pick<Shift, 'sales_total' | 'payment_totals'> }) {
  return (
    <dl
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label={t('cash.shifts.takings.title')}
    >
      <div>
        <dt className="type-caption">{t('cash.shifts.takings.sales')}</dt>
        <dd className="num" data-testid="taken-sales">
          {formatMoney(shift.sales_total)}
        </dd>
      </div>
      <div>
        <dt className="type-caption">{t('cash.shifts.takings.cash')}</dt>
        <dd className="num" data-testid="taken-cash">
          {formatMoney(shift.payment_totals.cash)}
        </dd>
      </div>
      <div>
        <dt className="type-caption">{t('cash.shifts.takings.bank')}</dt>
        <dd className="num" data-testid="taken-bank">
          {formatMoney(shift.payment_totals.bank_transfer)}
        </dd>
      </div>
      <div>
        <dt className="type-caption">{t('cash.shifts.takings.credit')}</dt>
        <dd className="num" data-testid="taken-credit">
          {formatMoney(shift.payment_totals.store_credit)}
        </dd>
      </div>
    </dl>
  );
}

export function ShiftMovementsTable({ movements }: { movements: ShiftMovement[] }) {
  if (movements.length === 0) {
    return <p className="type-caption px-4 py-3">{t('cash.shifts.current.noMovements')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <caption className="sr-only">{t('cash.shifts.current.movements')}</caption>
        <thead className="border-b border-line bg-paper">
          <tr>
            <th className={th}>{t('cash.shifts.movement.time')}</th>
            <th className={th}>{t('cash.shifts.movement.type')}</th>
            <th className={th}>{t('cash.shifts.movement.document')}</th>
            <th className={th}>{t('cash.shifts.movement.note')}</th>
            <th className={thNum}>{t('cash.shifts.movement.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b border-line">
              <td className={`${td} whitespace-nowrap`}>{formatDateTime(m.created_at)}</td>
              <td className={td}>{movementLabel(m)}</td>
              <td className={td}>
                <span dir="ltr">{m.source_number ?? ''}</span>
              </td>
              <td className={td}>
                <span dir="auto">{m.note ?? ''}</span>
              </td>
              <td className={tdNum}>{formatMoney(m.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Opens the caller's shift: branch, float and (for a float) the safe it comes from. */
export function OpenShiftForm() {
  const branches = useBranches();
  const refresh = useRefreshShifts();
  const [pickedBranch, setPickedBranch] = useState('');
  const [float, setFloat] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [error, setError] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per form: a double click opens one shift.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);
  const branchId = pickedBranch || (branches.data ?? [])[0]?.id || '';
  const hasFloat = MONEY.test(float) && !isZero(float);
  const vaults = useVaults(branchId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (posting.current) return;
    setError('');
    setVaultError('');
    if (float !== '' && !MONEY.test(float)) {
      setError(t('cash.shifts.errors.validation'));
      return;
    }
    if (hasFloat && !vaultId) {
      setVaultError(t('cash.shifts.open.vaultRequired'));
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      const shift = await shiftsApi.open(
        {
          branch_id: branchId,
          opening_float: hasFloat ? float : '0',
          ...(hasFloat ? { vault_id: vaultId } : {}),
        },
        key,
      );
      notify.success(t('cash.shifts.open.opened', { number: shift.number }));
      await refresh();
    } catch (err) {
      setError(shiftError(err));
      // A refused call can be tried again; after a success the page shows the open shift.
      posting.current = false;
      setBusy(false);
    }
  }

  const vaultOptions = (vaults.data ?? []).map((v) => ({ value: v.id, label: v.name }));
  return (
    <form className="space-y-3" noValidate onSubmit={(e) => void submit(e)}>
      <h3 className="type-section-title">{t('cash.shifts.open.title')}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <Select
          label={t('cash.shifts.open.branch')}
          value={branchId}
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          onChange={(e) => {
            setPickedBranch(e.target.value);
            setVaultId('');
          }}
        />
        <MoneyInput
          label={t('cash.shifts.open.float')}
          value={float}
          help={t('cash.shifts.open.floatHelp')}
          onValueChange={setFloat}
        />
        {hasFloat && (
          <Select
            label={t('cash.shifts.open.vault')}
            value={vaultId}
            placeholder={t('cash.shifts.open.chooseVault')}
            options={vaultOptions}
            error={vaultError}
            help={
              vaults.isSuccess && vaultOptions.length === 0
                ? t('cash.shifts.open.noVaults')
                : undefined
            }
            onChange={(e) => {
              setVaultId(e.target.value);
              setVaultError('');
            }}
          />
        )}
      </div>
      <FormError message={error} />
      <Button type="submit" loading={busy} disabled={busy || branchId === ''}>
        {t('cash.shifts.open.submit')}
      </Button>
    </form>
  );
}

/** Cash from a safe into the drawer (in) or from the drawer into a safe (out), with a note. */
export function ShiftCashDialog({
  shift,
  direction,
  onClose,
}: {
  shift: Shift;
  direction: 'in' | 'out';
  onClose: () => void;
}) {
  const refresh = useRefreshShifts();
  const vaults = useVaults(shift.branch_id);
  const [amount, setAmount] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; vault?: string; note?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog: a double click moves the cash once.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);

  async function submit() {
    if (posting.current) return;
    setError('');
    const text = note.trim();
    const bad = {
      ...(MONEY.test(amount) && !isZero(amount)
        ? {}
        : { amount: t('cash.shifts.cash.amountInvalid') }),
      ...(vaultId ? {} : { vault: t('cash.shifts.close.vaultRequired') }),
      ...(text.length >= 3 && text.length <= 500
        ? {}
        : { note: t('cash.shifts.cash.noteInvalid') }),
    };
    setErrors(bad);
    if (Object.keys(bad).length > 0) return;
    posting.current = true;
    setBusy(true);
    try {
      await shiftsApi.cash(shift.id, { direction, amount, vault_id: vaultId, note: text }, key);
      notify.success(t('cash.shifts.cash.saved'));
      await refresh();
      onClose();
    } catch (err) {
      setError(shiftError(err));
      posting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t(direction === 'in' ? 'cash.shifts.cash.inTitle' : 'cash.shifts.cash.outTitle')}
      description={t(direction === 'in' ? 'cash.shifts.cash.inHelp' : 'cash.shifts.cash.outHelp')}
    >
      <div className="space-y-3">
        <MoneyInput
          label={t('cash.shifts.cash.amount')}
          value={amount}
          required
          error={errors.amount}
          onValueChange={setAmount}
        />
        <Select
          label={t('cash.shifts.cash.vault')}
          value={vaultId}
          placeholder={t('cash.shifts.open.chooseVault')}
          options={(vaults.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
          error={errors.vault}
          onChange={(e) => setVaultId(e.target.value)}
        />
        <Textarea
          label={t('cash.shifts.cash.note')}
          value={note}
          maxLength={500}
          rows={2}
          error={errors.note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError message={error} />
        <Button loading={busy} disabled={busy} onClick={() => void submit()}>
          {t('cash.shifts.cash.submit')}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Closing: the cash is counted note by note; the dialog shows counted against expected. A
 * difference needs a reason; counted cash needs the safe it goes to.
 */
export function CloseShiftDialog({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const refresh = useRefreshShifts();
  const vaults = useVaults(shift.branch_id);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [vaultId, setVaultId] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);

  const parsed: ShiftCounts = {};
  for (const d of SHIFT_DENOMINATIONS) {
    const n = Number(counts[d] || 0);
    if (Number.isInteger(n) && n > 0) parsed[d] = n;
  }
  const counted = shiftCountTotal(parsed);
  const difference = moneyDifference(counted, shift.expected_cash);
  const differs = !isZero(difference);

  async function submit() {
    if (posting.current) return;
    setError('');
    setReasonError('');
    setVaultError('');
    const text = reason.trim();
    let ok = true;
    if (differs && (text.length < 3 || text.length > 500)) {
      setReasonError(t('cash.shifts.close.reasonRequired'));
      ok = false;
    }
    if (!isZero(counted) && !vaultId) {
      setVaultError(t('cash.shifts.close.vaultRequired'));
      ok = false;
    }
    if (!ok) return;
    posting.current = true;
    setBusy(true);
    try {
      const closed = await shiftsApi.close(shift.id, {
        counts: parsed,
        ...(!isZero(counted) ? { vault_id: vaultId } : {}),
        ...(differs ? { difference_reason: text } : {}),
      });
      notify.success(t('cash.shifts.close.closed', { number: closed.number }));
      await refresh();
      onClose();
    } catch (err) {
      setError(shiftError(err));
      // The expected cash may have changed (a sale came in): show the latest before a retry.
      void refresh();
      posting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('cash.shifts.close.title')}
      description={t('cash.shifts.close.help')}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SHIFT_DENOMINATIONS.map((d) => (
            <NumberInput
              key={d}
              label={t('cash.shifts.close.count', { denomination: d })}
              value={counts[d] ?? ''}
              onValueChange={(v) => setCounts((c) => ({ ...c, [d]: v }))}
            />
          ))}
        </div>
        <dl className="grid grid-cols-3 gap-2" aria-live="polite">
          <div>
            <dt className="type-caption">{t('cash.shifts.close.counted')}</dt>
            <dd className="num" data-testid="shift-counted">
              {formatMoney(counted)}
            </dd>
          </div>
          <div>
            <dt className="type-caption">{t('cash.shifts.close.expected')}</dt>
            <dd className="num">{formatMoney(shift.expected_cash)}</dd>
          </div>
          <div>
            <dt className="type-caption">{t('cash.shifts.close.difference')}</dt>
            <dd
              className={`num ${differs ? 'text-danger-700' : ''}`}
              data-testid="shift-difference"
            >
              {formatMoney(difference)}
            </dd>
          </div>
        </dl>
        <div className="space-y-1">
          <p className="type-caption">{t('cash.shifts.takings.title')}</p>
          <ShiftTakings shift={shift} />
        </div>
        {differs && (
          <Textarea
            label={t('cash.shifts.close.reason')}
            value={reason}
            maxLength={500}
            rows={2}
            error={reasonError}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {!isZero(counted) && (
          <Select
            label={t('cash.shifts.close.vault')}
            value={vaultId}
            placeholder={t('cash.shifts.open.chooseVault')}
            options={(vaults.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
            error={vaultError}
            onChange={(e) => {
              setVaultId(e.target.value);
              setVaultError('');
            }}
          />
        )}
        <FormError message={error} />
        <Button variant="danger" loading={busy} disabled={busy} onClick={() => void submit()}>
          {t('cash.shifts.close.submit')}
        </Button>
      </div>
    </Dialog>
  );
}
