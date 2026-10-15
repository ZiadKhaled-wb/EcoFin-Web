import { useState, type FormEvent } from 'react';
import { CreditLimitBody, compareMoney, type CreditProfile } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { formatMoney } from '@/lib/format';
import { creditApi } from '@/services/creditApi';
import { t } from '@/i18n';
import { creditError } from './creditShared';

export interface CreditLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  profile: CreditProfile;
  onSaved: (profile: CreditProfile) => void;
}

/**
 * R03 (D72): set the credit limit. Prefilled with the suggestion (income × the shop's multiple) when
 * there is one; the suggestion is only a hint and never used by the check. Raising the limit needs
 * a reason (kept in the audit log); lowering does not. Mount it with the current limit as key.
 */
export default function CreditLimitDialog({
  open,
  onOpenChange,
  customerId,
  profile,
  onSaved,
}: CreditLimitDialogProps) {
  const [limit, setLimit] = useState(profile.suggested_limit ?? profile.credit_limit);
  const [reason, setReason] = useState('');
  const [limitError, setLimitError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setLimitError('');
    setReasonError('');
    setFormError('');
    const text = reason.trim();
    const parsed = CreditLimitBody.safeParse({
      credit_limit: limit.trim(),
      ...(text ? { reason: text } : {}),
    });
    if (!parsed.success) {
      setLimitError(t('credit.errors.validation'));
      return;
    }
    const raising = compareMoney(parsed.data.credit_limit, profile.credit_limit) > 0;
    if (raising && text.length < 3) {
      setReasonError(t('credit.errors.reasonRequired'));
      return;
    }
    setSaving(true);
    try {
      const saved = await creditApi.setLimit(customerId, parsed.data);
      notify.success(t('credit.limit.saved'));
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setFormError(creditError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('credit.limit.title')}
      description={t('credit.limit.hint')}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        <MoneyInput
          label={t('credit.limit.field')}
          value={limit}
          required
          error={limitError}
          help={
            profile.suggested_limit === null
              ? t('credit.limit.noSuggestion')
              : t('credit.limit.suggestedHint', { amount: formatMoney(profile.suggested_limit) })
          }
          onValueChange={setLimit}
        />
        <Textarea
          label={t('credit.limit.reason')}
          value={reason}
          maxLength={300}
          rows={3}
          error={reasonError}
          help={t('credit.limit.reasonHint')}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('credit.limit.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('credit.limit.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
