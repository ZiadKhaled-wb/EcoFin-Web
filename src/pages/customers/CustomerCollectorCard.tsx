import { useState, type FormEvent } from 'react';
import type { Customer } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { walletsApi } from '@/services/walletsApi';
import { t } from '@/i18n';
import { useCollectorOptions, walletError } from '../installments/walletShared';

/**
 * N06 (D81): the customer's collector. One collector covers all the customer's contracts; a
 * manager (customer.edit) assigns, changes or removes them. The server checks the employee again
 * (active, takes collections): COLLECTOR_INVALID otherwise.
 */
export default function CustomerCollectorCard({
  customer,
  onChanged,
}: {
  customer: Customer;
  onChanged: () => void;
}) {
  const canEdit = useCan('customer.edit');
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const collector = customer.collector;

  async function clear() {
    setBusy(true);
    try {
      await walletsApi.setCollector(customer.id, { employee_id: null });
      notify.success(t('wallets.collector.cleared'));
      onChanged();
      setClearing(false);
    } catch (err) {
      notify.error(walletError(err));
      setClearing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={t('wallets.collector.title')}
      description={t('wallets.collector.description')}
      actions={
        canEdit ? (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {collector ? t('wallets.collector.change') : t('wallets.collector.assign')}
            </Button>
            {collector && (
              <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>
                {t('wallets.collector.clear')}
              </Button>
            )}
          </span>
        ) : undefined
      }
    >
      <p className="type-body" data-testid="customer-collector" dir="auto">
        {collector ? collector.name : t('wallets.collector.none')}
      </p>
      {editing && (
        <AssignDialog
          key={collector?.id ?? 'none'}
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      <ConfirmDialog
        open={clearing}
        onOpenChange={(open) => !open && setClearing(false)}
        title={t('wallets.collector.clearTitle')}
        description={t('wallets.collector.clearText')}
        confirmLabel={t('wallets.collector.clear')}
        loading={busy}
        onConfirm={() => void clear()}
      />
    </Card>
  );
}

function AssignDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = useCollectorOptions(true);
  const [employee, setEmployee] = useState(customer.collector?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!employee) {
      setError(t('wallets.collector.pickPlaceholder'));
      return;
    }
    setSaving(true);
    try {
      await walletsApi.setCollector(customer.id, {
        employee_id: employee,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      notify.success(t('wallets.collector.saved'));
      onSaved();
    } catch (err) {
      setError(walletError(err));
    } finally {
      setSaving(false);
    }
  }

  // The current collector is always offered, even when the list could not name them.
  const list = [...options.options];
  if (customer.collector && !list.some((o) => o.value === customer.collector!.id)) {
    list.unshift({ value: customer.collector.id, label: customer.collector.name });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('wallets.collector.title')}
      description={t('wallets.collector.pickHelp')}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4" noValidate>
        {options.selfOnly && <Notice tone="info">{t('wallets.collector.selfOnly')}</Notice>}
        {options.failed && <Notice tone="error">{t('wallets.collector.failed')}</Notice>}
        <Select
          label={t('wallets.collector.pick')}
          placeholder={t('wallets.collector.pickPlaceholder')}
          options={list}
          value={employee}
          required
          disabled={options.loading}
          onChange={(e) => setEmployee(e.target.value)}
        />
        <Textarea
          label={t('wallets.collector.reason')}
          help={t('wallets.collector.reasonHelp')}
          value={reason}
          maxLength={300}
          rows={2}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('wallets.collector.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('wallets.collector.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
