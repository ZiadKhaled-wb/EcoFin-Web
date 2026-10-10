import { useState, type FormEvent } from 'react';
import { CustomerStatusBody, type Customer } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { customersApi } from '@/services/customersApi';
import { t } from '@/i18n';
import { CUSTOMER_API_ERRORS } from './customerShared';

export interface CustomerStatusDialogProps {
  /** The customer to block (when active or under watch) or unblock (when blocked); null = closed. */
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

/**
 * R01 (D62): blocking asks for a reason (kept in the audit log); unblocking only asks to confirm.
 * Mount it with the customer's id as key so the reason starts empty each time.
 */
export default function CustomerStatusDialog({
  customer,
  onClose,
  onSaved,
}: CustomerStatusDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const blocking = customer !== null && customer.status !== 'blocked';

  async function send(body: unknown) {
    if (!customer) return;
    setReasonError('');
    setFormError('');
    const parsed = CustomerStatusBody.safeParse(body);
    if (!parsed.success) {
      setReasonError(t('customers.errors.reason'));
      return;
    }
    setSaving(true);
    try {
      const saved = await customersApi.setStatus(customer.id, parsed.data);
      notify.success(t(saved.status === 'blocked' ? 'customers.blocked' : 'customers.unblocked'));
      onSaved(saved);
      onClose();
    } catch (err) {
      const message = t(
        CUSTOMER_API_ERRORS[err instanceof ApiError ? err.code : ''] ?? 'customers.errors.failed',
      );
      if (blocking) setFormError(message);
      else {
        notify.error(message);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!blocking) {
    return (
      <ConfirmDialog
        open={customer !== null}
        onOpenChange={(open) => !open && onClose()}
        title={t('customers.unblockTitle')}
        description={t('customers.unblockConfirm')}
        confirmLabel={t('customers.unblock')}
        loading={saving}
        onConfirm={() => void send({ status: 'active' })}
      />
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('customers.blockTitle')}
      description={t('customers.blockHint')}
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send({ status: 'blocked', reason });
        }}
        className="space-y-4"
        noValidate
      >
        <Textarea
          label={t('customers.blockReason')}
          value={reason}
          maxLength={300}
          rows={3}
          required
          error={reasonError}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={formError} />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={saving}>
            {t('customers.block')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('customers.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
