import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShiftForceCloseBody, type ShiftSummary } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import MoneyInput from '@/components/ui/MoneyInput';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { shiftsApi, shiftKeys } from '@/services/shiftsApi';
import { cashKeys } from '@/services/cashApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import { shiftError } from './shiftShared';

export default function ForceCloseShiftDialog({
  shift,
  onClose,
}: {
  shift: ShiftSummary;
  onClose: () => void;
}) {
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ cash?: string; reason?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  async function submit() {
    if (posting.current) return;
    const parsed = ShiftForceCloseBody.safeParse({ counted_cash: counted, reason });
    setError('');
    setErrors({});
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path[0]);
      setErrors({
        ...(paths.includes('counted_cash')
          ? { cash: t('cash.shifts.forceClose.cashInvalid') }
          : {}),
        ...(paths.includes('reason') ? { reason: t('cash.shifts.forceClose.reasonRequired') } : {}),
      });
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      await shiftsApi.forceClose(shift.id, parsed.data);
      await Promise.all([
        cache.invalidateQueries({ queryKey: shiftKeys.all(orgId) }),
        cache.invalidateQueries({ queryKey: cashKeys.all(orgId) }),
      ]);
      notify.success(t('cash.shifts.forceClose.saved'));
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
      title={t('cash.shifts.forceClose.title')}
      description={t('cash.shifts.forceClose.description')}
      onOpenChange={(open) => !open && onClose()}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <p className="type-body" dir="ltr">
          {shift.number}
        </p>
        <MoneyInput
          label={t('cash.shifts.forceClose.counted')}
          value={counted}
          onValueChange={setCounted}
          required
          error={errors.cash}
        />
        <Textarea
          label={t('cash.shifts.forceClose.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={500}
          error={errors.reason}
        />
        <FormError message={error} />
        <Button type="submit" loading={busy} disabled={busy}>
          {t('cash.shifts.forceClose.title')}
        </Button>
      </form>
    </Dialog>
  );
}
