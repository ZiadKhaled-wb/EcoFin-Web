import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ReverseMigrationBatchBody, type MigrationReportBatch } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { migrationApi, migrationKeys } from '@/services/migrationApi';
import { useAuthStore } from '@/store/authStore';
import { migrationErrorText } from './migrationShared';

/** Undo a wrong batch (import.data): a reason of 3 to 300 characters. The server decides if it can. */
export default function ReverseBatchDialog({
  batch,
  onClose,
}: {
  batch: MigrationReportBatch;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);

  async function submit() {
    if (posting.current) return;
    setError('');
    setReasonError('');
    const parsed = ReverseMigrationBatchBody.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(t('migration.reverse.reasonRequired'));
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      const out = await migrationApi.reverse(batch.id, parsed.data);
      await cache.invalidateQueries({ queryKey: migrationKeys.all(orgId) });
      notify.success(t('migration.reverse.done', { count: out.reversed_contracts }));
      onClose();
    } catch (err) {
      posting.current = false;
      setBusy(false);
      setError(migrationErrorText(err));
    }
  }

  return (
    <Dialog
      open
      title={t('migration.reverse.title')}
      description={t('migration.reverse.description', { count: batch.contracts })}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Textarea
          label={t('migration.reverse.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={300}
          error={reasonError || undefined}
        />
        <FormError message={error} />
        <Button type="submit" variant="danger" loading={busy} disabled={busy}>
          {t('migration.reverse.confirm')}
        </Button>
      </form>
    </Dialog>
  );
}
