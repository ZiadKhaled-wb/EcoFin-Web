import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SettleWalletBody,
  compareMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  type Money,
  type WalletRow,
  type WalletSettlement,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { formatMoney } from '@/lib/format';
import { cashApi, cashKeys } from '@/services/cashApi';
import { walletKeys, walletsApi } from '@/services/walletsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { walletError } from './walletShared';

const ZERO: Money = '0.00';
const amountOf = (v: string): Money | null => {
  const text = v.trim();
  if (text === '' || !/^\d{1,16}(\.\d{1,2})?$/.test(text)) return null;
  return roundMoney(text);
};

/**
 * N06 (D81): take a collector's wallet into a safe. Part of the cash may be handed in; what is
 * missing is recorded as a shortage with a reason (never deducted from anyone). The wallet's
 * balance as shown is sent too: if it moved meanwhile the server says so and nothing is settled.
 * Mount it with the wallet's balance in the key so the form restarts when the balance moves.
 */
export default function SettleWalletDialog({
  wallet,
  onClose,
  onSettled,
}: {
  wallet: WalletRow;
  onClose: () => void;
  onSettled: (settlement: WalletSettlement) => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const params = { status: 'active' as const, kind: 'safe' as const, branch_id: wallet.branch_id };
  const safes = useQuery({
    queryKey: cashKeys.accounts(orgId, params),
    queryFn: () => cashApi.list(params),
  });
  const safeOptions = (safes.data ?? [])
    .filter((a) => a.kind === 'safe')
    .map((a) => ({ value: a.id, label: a.name }));

  const [safe, setSafe] = useState('');
  const [handed, setHanded] = useState(wallet.balance);
  const [shortage, setShortage] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [keys] = useState(() => new Map<string, string>());

  const handedAmount = amountOf(handed);
  const shortageAmount = shortage.trim() === '' ? ZERO : amountOf(shortage);
  const left =
    handedAmount && shortageAmount
      ? subtractMoney(wallet.balance, sumMoney([handedAmount, shortageAmount]))
      : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!safe) next['safe'] = t('wallets.settle.needSafe');
    if (!handedAmount || compareMoney(handedAmount, ZERO) <= 0)
      next['handed'] = t('wallets.settle.needHanded');
    if (shortageAmount === null) next['shortage'] = t('wallets.settle.needHanded');
    if (left && compareMoney(left, ZERO) < 0) next['handed'] = t('wallets.settle.tooMuch');
    if (shortageAmount && compareMoney(shortageAmount, ZERO) > 0 && reason.trim().length < 3) {
      next['reason'] = t('wallets.settle.needReason');
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !handedAmount || !shortageAmount) return;

    const hasShortage = compareMoney(shortageAmount, ZERO) > 0;
    const parsed = SettleWalletBody.safeParse({
      to_account_id: safe,
      handed: handedAmount,
      ...(hasShortage ? { shortage: shortageAmount, reason: reason.trim() } : {}),
      expected_balance: wallet.balance,
    });
    if (!parsed.success) {
      setFormError(t('wallets.errors.failed'));
      return;
    }
    // One attempt, one settlement: the same content keeps its key (a double click, a retry).
    const content = JSON.stringify(parsed.data);
    if (!keys.has(content)) keys.set(content, crypto.randomUUID());
    setSaving(true);
    try {
      const done = await walletsApi.settle(wallet.id, parsed.data, keys.get(content)!);
      notify.success(t('wallets.settle.done', { number: done.number }));
      void cache.invalidateQueries({ queryKey: walletKeys.all(orgId) });
      onSettled(done);
      onClose();
    } catch (err) {
      setFormError(walletError(err));
      void cache.invalidateQueries({ queryKey: walletKeys.all(orgId) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('wallets.settle.title', { name: wallet.collector.name })}
      description={t('wallets.settle.description')}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <p className="type-body" data-testid="settle-balance">
          {t('wallets.settle.balance', { amount: formatMoney(wallet.balance) })}
        </p>
        <Select
          label={t('wallets.settle.safe')}
          placeholder={t('wallets.settle.safePlaceholder')}
          help={t('wallets.settle.safeHelp')}
          options={safeOptions}
          value={safe}
          required
          disabled={safes.isPending}
          error={errors['safe'] ?? ''}
          onChange={(e) => setSafe(e.target.value)}
        />
        {safes.isError && <FormError message={t('wallets.settle.loadSafesFailed')} />}
        <MoneyInput
          label={t('wallets.settle.handed')}
          value={handed}
          error={errors['handed'] ?? ''}
          onValueChange={setHanded}
        />
        <MoneyInput
          label={t('wallets.settle.shortage')}
          help={t('wallets.settle.shortageHelp')}
          value={shortage}
          error={errors['shortage'] ?? ''}
          onValueChange={setShortage}
        />
        {shortageAmount && compareMoney(shortageAmount, ZERO) > 0 && (
          <Textarea
            label={t('wallets.settle.reason')}
            value={reason}
            maxLength={300}
            rows={2}
            required
            error={errors['reason'] ?? ''}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {left && compareMoney(left, ZERO) >= 0 && (
          <p className="type-caption" data-testid="settle-left">
            {t('wallets.settle.after', { amount: formatMoney(left) })}
          </p>
        )}
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('wallets.settle.confirm')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('wallets.settle.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
