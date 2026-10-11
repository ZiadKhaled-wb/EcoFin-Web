import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Expense, ExpenseCategory } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import RadioGroup from '@/components/ui/RadioGroup';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useBranches } from '@/features/me/useBranches';
import { useCan } from '@/features/me/useCan';
import { formatMoney } from '@/lib/format';
import { cashApi, cashKeys, type CashAccountListParams } from '@/services/cashApi';
import { expenseKeys, expensesApi } from '@/services/expensesApi';
import { shiftKeys, shiftsApi } from '@/services/shiftsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { isZero } from './cashShared';
import { expenseError } from './expenseShared';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const ACTIVE: CashAccountListParams = { status: 'active' };

function useRefreshExpenses() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  return () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: expenseKeys.all(orgId) }),
      cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
      cache.invalidateQueries({ queryKey: shiftKeys.all(orgId) }),
    ]);
}

/** The active safes and banks an expense of `branchId` can leave (a shop-wide bank included). */
function useBranchVaults(branchId: string, enabled: boolean) {
  const orgId = useAuthStore((s) => s.orgId);
  const accounts = useQuery({
    queryKey: cashKeys.accounts(orgId, ACTIVE),
    queryFn: () => cashApi.list(ACTIVE),
    enabled,
  });
  const options = (accounts.data ?? [])
    .filter(
      (a) =>
        (a.kind === 'safe' || a.kind === 'bank') &&
        (a.branch_id === branchId || (a.kind === 'bank' && a.branch_id === null)),
    )
    .map((a) => ({ value: a.id, label: `${a.name} (${formatMoney(a.balance)})` }));
  return { options, loaded: accounts.isSuccess };
}

/**
 * A new expense: category, amount, where the money leaves (a vault of a branch, or the drawer of
 * the caller's open shift), an optional note and receipt.
 */
export function NewExpenseDialog({ onClose }: { onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const canVault = useCan('cash.view');
  const canShift = useCan('shift.operate');
  const branches = useBranches();
  const refresh = useRefreshExpenses();
  const categories = useQuery({
    queryKey: expenseKeys.categories(orgId, false),
    queryFn: () => expensesApi.categories(false),
  });
  const current = useQuery({
    queryKey: shiftKeys.current(orgId),
    queryFn: shiftsApi.current,
    enabled: canShift,
  });
  const shift = current.data ?? null;
  const [picked, setPicked] = useState<'vault' | 'shift' | ''>('');
  const source = picked || (canVault ? 'vault' : 'shift');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [pickedBranch, setPickedBranch] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [note, setNote] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ category?: string; amount?: string; vault?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog: a double click records one expense.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const branchId = pickedBranch || (branches.data ?? [])[0]?.id || '';
  const vaults = useBranchVaults(branchId, canVault);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setReceiptId((await expensesApi.uploadReceipt(file)).id);
    } catch {
      setError(t('cash.expenses.errors.upload'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (posting.current) return;
    setError('');
    const bad = {
      ...(categoryId ? {} : { category: t('cash.expenses.errors.categoryRequired') }),
      ...(MONEY.test(amount) && !isZero(amount)
        ? {}
        : { amount: t('cash.expenses.errors.amountInvalid') }),
      ...(source === 'vault' && !vaultId ? { vault: t('cash.expenses.errors.vaultRequired') } : {}),
    };
    setErrors(bad);
    if (Object.keys(bad).length > 0) return;
    if (source === 'shift' && !shift) {
      setError(t('cash.expenses.errors.shiftRequired'));
      return;
    }
    posting.current = true;
    setBusy(true);
    const text = note.trim();
    try {
      const expense = await expensesApi.create(
        {
          category_id: categoryId,
          amount,
          ...(source === 'shift'
            ? { from_shift: true }
            : { branch_id: branchId, cash_account_id: vaultId }),
          ...(text ? { note: text } : {}),
          ...(receiptId ? { receipt_file_id: receiptId } : {}),
        },
        key,
      );
      notify.success(t('cash.expenses.form.saved', { number: expense.number }));
      await refresh();
      onClose();
    } catch (err) {
      setError(expenseError(err));
      // A refused call can be tried again; after a success the dialog is gone.
      posting.current = false;
      setBusy(false);
    }
  }

  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('cash.expenses.form.title')}
      description={t('cash.expenses.form.help')}
    >
      <form className="space-y-3" noValidate onSubmit={(e) => void submit(e)}>
        <Select
          label={t('cash.expenses.form.category')}
          value={categoryId}
          placeholder={t('cash.expenses.form.chooseCategory')}
          options={categoryOptions}
          error={errors.category}
          help={
            categories.isSuccess && categoryOptions.length === 0
              ? t('cash.expenses.form.noCategories')
              : undefined
          }
          onChange={(e) => setCategoryId(e.target.value)}
        />
        <MoneyInput
          label={t('cash.expenses.form.amount')}
          value={amount}
          required
          error={errors.amount}
          onValueChange={setAmount}
        />
        {canVault && canShift && (
          <RadioGroup
            label={t('cash.expenses.form.source')}
            name="expense-source"
            orientation="horizontal"
            value={source}
            options={[
              { value: 'vault', label: t('cash.expenses.form.fromVault') },
              { value: 'shift', label: t('cash.expenses.form.fromShift') },
            ]}
            onChange={(v) => setPicked(v === 'shift' ? 'shift' : 'vault')}
          />
        )}
        {source === 'shift' ? (
          <p className="type-body" data-testid="expense-shift">
            {shift
              ? t('cash.expenses.form.shiftInfo', {
                  number: shift.number,
                  amount: formatMoney(shift.expected_cash),
                })
              : current.isPending && canShift
                ? ''
                : t('cash.expenses.form.noShift')}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label={t('cash.expenses.form.branch')}
              value={branchId}
              options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              onChange={(e) => {
                setPickedBranch(e.target.value);
                setVaultId('');
              }}
            />
            <Select
              label={t('cash.expenses.form.vault')}
              value={vaultId}
              placeholder={t('cash.expenses.form.chooseVault')}
              options={vaults.options}
              error={errors.vault}
              help={
                vaults.loaded && vaults.options.length === 0
                  ? t('cash.expenses.form.noVaults')
                  : undefined
              }
              onChange={(e) => setVaultId(e.target.value)}
            />
          </div>
        )}
        <Textarea
          label={t('cash.expenses.form.note')}
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-label">{t('cash.expenses.form.receipt')}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="sr-only"
            aria-label={t('cash.expenses.form.uploadReceipt')}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          {receiptId ? (
            <>
              <Badge tone="success">{t('cash.expenses.form.receiptSet')}</Badge>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptId('')}>
                {t('cash.expenses.form.removeReceipt')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={uploading}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {t('cash.expenses.form.uploadReceipt')}
            </Button>
          )}
        </div>
        <FormError message={error} />
        <Button type="submit" loading={busy} disabled={busy || uploading}>
          {t('cash.expenses.form.submit')}
        </Button>
      </form>
    </Dialog>
  );
}

/**
 * The owner undoes an expense with a reason. An expense paid from a shift may need the vault the
 * money goes back to (when that shift is closed by now).
 */
export function ReverseExpenseDialog({
  expense,
  onClose,
}: {
  expense: Expense;
  onClose: () => void;
}) {
  const refresh = useRefreshExpenses();
  const fromShift = expense.shift_id !== null;
  const vaults = useBranchVaults(expense.branch_id, fromShift);
  const [reason, setReason] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog: a double click reverses once.
  const [key] = useState(() => crypto.randomUUID());
  const posting = useRef(false);

  async function submit() {
    if (posting.current) return;
    setError('');
    const text = reason.trim();
    if (text.length < 3 || text.length > 500) {
      setReasonError(t('cash.expenses.reverse.reasonInvalid'));
      return;
    }
    setReasonError('');
    posting.current = true;
    setBusy(true);
    try {
      await expensesApi.reverse(
        expense.id,
        { reason: text, ...(vaultId ? { cash_account_id: vaultId } : {}) },
        key,
      );
      notify.success(t('cash.expenses.reverse.saved'));
      await refresh();
      onClose();
    } catch (err) {
      setError(expenseError(err));
      posting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('cash.expenses.reverse.title', { number: expense.number })}
      description={t('cash.expenses.reverse.help')}
    >
      <div className="space-y-3">
        <Textarea
          label={t('cash.expenses.reverse.reason')}
          value={reason}
          maxLength={500}
          rows={2}
          required
          error={reasonError}
          onChange={(e) => setReason(e.target.value)}
        />
        {fromShift && (
          <Select
            label={t('cash.expenses.reverse.vault')}
            value={vaultId}
            options={[
              { value: '', label: t('cash.expenses.reverse.sameAccount') },
              ...vaults.options,
            ]}
            help={t('cash.expenses.reverse.vaultHelp')}
            onChange={(e) => setVaultId(e.target.value)}
          />
        )}
        <FormError message={error} />
        <Button variant="danger" loading={busy} disabled={busy} onClick={() => void submit()}>
          {t('cash.expenses.reverse.submit')}
        </Button>
      </div>
    </Dialog>
  );
}

/** The shop's expense categories: add, rename, archive and restore. */
export function ExpenseCategoriesDialog({ onClose }: { onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: expenseKeys.categories(orgId, true),
    queryFn: () => expensesApi.categories(true),
  });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = (v: string) => v.trim().length >= 1 && v.trim().length <= 80;

  /** Runs one change, then reloads the categories and the expenses that show their names. */
  async function run(change: () => Promise<ExpenseCategory>, done: string) {
    if (busy) return false;
    setError('');
    setBusy(true);
    try {
      await change();
      notify.success(done);
      await cache.invalidateQueries({ queryKey: expenseKeys.all(orgId) });
      return true;
    } catch (err) {
      setError(expenseError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!valid(name)) {
      setError(t('cash.expenses.cats.nameInvalid'));
      return;
    }
    if (await run(() => expensesApi.createCategory(name.trim()), t('cash.expenses.cats.added'))) {
      setName('');
    }
  }

  async function rename() {
    if (!editing) return;
    if (!valid(editing.name)) {
      setError(t('cash.expenses.cats.nameInvalid'));
      return;
    }
    const { id, name: next } = editing;
    if (
      await run(() => expensesApi.renameCategory(id, next.trim()), t('cash.expenses.cats.renamed'))
    ) {
      setEditing(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('cash.expenses.cats.title')}
      description={t('cash.expenses.cats.help')}
    >
      <div className="space-y-4">
        <form className="flex items-end gap-2" noValidate onSubmit={(e) => void add(e)}>
          <div className="grow">
            <FormField
              label={t('cash.expenses.cats.name')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {t('cash.expenses.cats.add')}
          </Button>
        </form>
        <FormError message={error} />
        {list.isSuccess && list.data.length === 0 ? (
          <p className="type-caption">{t('cash.expenses.cats.empty')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {(list.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {editing?.id === c.id ? (
                  <>
                    <input
                      className="field-input grow"
                      aria-label={t('cash.expenses.cats.name')}
                      value={editing.name}
                      maxLength={80}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                    />
                    <Button size="sm" disabled={busy} onClick={() => void rename()}>
                      {t('cash.expenses.cats.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t('cash.expenses.cats.cancel')}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="type-body grow" dir="auto">
                      {c.name}
                    </span>
                    {c.archived_at !== null && (
                      <Badge>{t('cash.expenses.cats.archivedBadge')}</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditing({ id: c.id, name: c.name })}
                    >
                      {t('cash.expenses.cats.rename')}
                    </Button>
                    {c.archived_at === null ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => expensesApi.archiveCategory(c.id),
                            t('cash.expenses.cats.archived'),
                          )
                        }
                      >
                        {t('cash.expenses.cats.archive')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => expensesApi.restoreCategory(c.id),
                            t('cash.expenses.cats.restored'),
                          )
                        }
                      >
                        {t('cash.expenses.cats.restore')}
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
