import { useState, type FormEvent } from 'react';
import {
  CashAccountCreateBody,
  CashAccountUpdateBody,
  CashOpeningBody,
  CashTransferCreateBody,
  type BranchSummary,
  type CashAccount,
  type CashAccountKind,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { cashApi } from '@/services/cashApi';
import { t } from '@/i18n';
import { accountLabel, cashError } from './cashShared';

const KINDS: CashAccountKind[] = ['safe', 'bank'];
const SHOP_WIDE = '';

/**
 * Add (account = null) or rename. Kind and branch are fixed once created (D56), so the rename
 * form shows the name only. Mounted per opening.
 */
export function CashAccountForm({
  account,
  branches,
  onClose,
  onSaved,
}: {
  account: CashAccount | null;
  branches: BranchSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<CashAccountKind>('safe');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? SHOP_WIDE);
  const [errors, setErrors] = useState<{ name?: string; branch?: string }>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    const parsed = account
      ? CashAccountUpdateBody.safeParse({ name })
      : CashAccountCreateBody.safeParse({
          name,
          kind,
          branch_id: branchId === SHOP_WIDE ? null : branchId,
        });
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => String(i.path[0] ?? ''));
      setErrors({
        ...(paths.includes('name') ? { name: t('cash.errors.name') } : {}),
        ...(paths.includes('branch_id') ? { branch: t('cash.errors.safeNeedsBranch') } : {}),
      });
      return;
    }
    if (account && parsed.data.name === account.name) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (account) await cashApi.rename(account.id, parsed.data.name);
      else await cashApi.create(CashAccountCreateBody.parse(parsed.data));
      notify.success(t('cash.saved'));
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CASH_ACCOUNT_NAME_TAKEN') {
        setErrors({ name: t('cash.errors.nameTaken') });
      } else setFormError(cashError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t(account ? 'cash.renameTitle' : 'cash.add')}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <FormField
          label={t('cash.fields.name')}
          value={name}
          maxLength={100}
          required
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        {!account && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t('cash.fields.kind')}
              value={kind}
              options={KINDS.map((k) => ({ value: k, label: t(`cash.kind.${k}`) }))}
              onChange={(e) => setKind(e.target.value as CashAccountKind)}
            />
            <Select
              label={t('cash.fields.branch')}
              value={branchId}
              error={errors.branch}
              help={t('cash.fields.branchHelp')}
              options={[
                ...branches.map((b) => ({ value: b.id, label: b.name })),
                { value: SHOP_WIDE, label: t('cash.shopWide') },
              ]}
              onChange={(e) => setBranchId(e.target.value)}
            />
          </div>
        )}
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('cash.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cash.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** One opening balance on an empty account; one idempotency key per opening of the dialog. */
export function CashOpeningDialog({
  account,
  onClose,
  onSaved,
}: {
  account: CashAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; note?: string }>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    const parsed = CashOpeningBody.safeParse({ amount, note });
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => String(i.path[0] ?? ''));
      setErrors({
        ...(paths.includes('amount') ? { amount: t('cash.errors.amount') } : {}),
        ...(paths.includes('note') ? { note: t('cash.errors.openingNote') } : {}),
      });
      return;
    }
    setSaving(true);
    try {
      await cashApi.opening(account.id, parsed.data, key);
      notify.success(t('cash.openingSaved'));
      onSaved();
      onClose();
    } catch (err) {
      setFormError(cashError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('cash.openingTitle')}
      description={accountLabel(account)}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <MoneyInput
          label={t('cash.fields.amount')}
          value={amount}
          required
          error={errors.amount}
          onValueChange={setAmount}
        />
        <Textarea
          label={t('cash.fields.openingNote')}
          value={note}
          maxLength={500}
          rows={2}
          required
          error={errors.note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('cash.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cash.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Money from one active account to another (cash.transfer). One idempotency key per opening of
 * the dialog: a second click or a retry moves the money once (D56).
 */
export function CashTransferDialog({
  accounts,
  from,
  onClose,
  onSaved,
}: {
  accounts: CashAccount[];
  from?: CashAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const active = accounts.filter((a) => a.is_active);
  const [key] = useState(() => crypto.randomUUID());
  const [fromId, setFromId] = useState(from?.id ?? '');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ from?: string; to?: string; amount?: string }>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const options = active.map((a) => ({ value: a.id, label: accountLabel(a) }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    const parsed = CashTransferCreateBody.safeParse({
      from_account_id: fromId,
      to_account_id: toId,
      amount,
      ...(note.trim() ? { note } : {}),
    });
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => String(i.path[0] ?? ''));
      setErrors({
        ...(paths.includes('from_account_id') ? { from: t('cash.errors.pickAccount') } : {}),
        ...(paths.includes('to_account_id')
          ? {
              to: t(
                toId && toId === fromId ? 'cash.errors.sameAccount' : 'cash.errors.pickAccount',
              ),
            }
          : {}),
        ...(paths.includes('amount') ? { amount: t('cash.errors.amount') } : {}),
      });
      return;
    }
    setSaving(true);
    try {
      const transfer = await cashApi.transfer(parsed.data, key);
      notify.success(t('cash.transferSaved', { number: transfer.number }));
      onSaved();
      onClose();
    } catch (err) {
      setFormError(cashError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={t('cash.transferTitle')}>
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('cash.fields.from')}
            value={fromId}
            placeholder={t('cash.fields.pick')}
            options={options}
            error={errors.from}
            onChange={(e) => setFromId(e.target.value)}
          />
          <Select
            label={t('cash.fields.to')}
            value={toId}
            placeholder={t('cash.fields.pick')}
            options={options.filter((o) => o.value !== fromId)}
            error={errors.to}
            onChange={(e) => setToId(e.target.value)}
          />
        </div>
        <MoneyInput
          label={t('cash.fields.amount')}
          value={amount}
          required
          error={errors.amount}
          onValueChange={setAmount}
        />
        <Textarea
          label={t('cash.fields.note')}
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('cash.transfer')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cash.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
