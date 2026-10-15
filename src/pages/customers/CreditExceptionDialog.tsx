import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreditExceptionRequestBody, type CreditException } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { creditApi, creditKeys } from '@/services/creditApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { EXCEPTION_HOURS, creditError } from './creditShared';

export interface CreditExceptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  /** Prefill for the amount, e.g. the financed amount of the sale being made (N02's POS screen). */
  amount?: string;
  onSent?: (exception: CreditException) => void;
}

/**
 * R03 (D72): ask a manager for a credit exception for this customer and financed amount. The
 * server says whether one is needed (APPROVAL_NOT_NEEDED) and who may decide it. N02's POS screen
 * reuses this dialog.
 */
export default function CreditExceptionDialog({
  open,
  onOpenChange,
  customerId,
  amount: initialAmount = '',
  onSent,
}: CreditExceptionDialogProps) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [amount, setAmount] = useState(initialAmount);
  const [reason, setReason] = useState('');
  const [amountError, setAmountError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setAmountError('');
    setReasonError('');
    setFormError('');
    const text = reason.trim();
    const parsed = CreditExceptionRequestBody.safeParse({
      financed_amount: amount.trim(),
      reason: text,
    });
    if (!parsed.success) {
      setAmountError(t('credit.errors.validation'));
      return;
    }
    if (text.length < 3) {
      setReasonError(t('credit.errors.reasonRequired'));
      return;
    }
    setSaving(true);
    try {
      const sent = await creditApi.requestException(customerId, parsed.data);
      notify.success(t('credit.request.sent'));
      await cache.invalidateQueries({ queryKey: creditKeys.exceptions(orgId) });
      onSent?.(sent);
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
      title={t('credit.request.title')}
      description={t('credit.request.hint', { hours: EXCEPTION_HOURS })}
    >
      <form onSubmit={(e) => void send(e)} className="space-y-4" noValidate>
        <MoneyInput
          label={t('credit.request.amount')}
          value={amount}
          required
          error={amountError}
          onValueChange={setAmount}
        />
        <Textarea
          label={t('credit.request.reason')}
          value={reason}
          maxLength={300}
          rows={3}
          required
          error={reasonError}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('credit.request.send')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('credit.request.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
