import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import FormError from '@/components/ui/FormError';
import { t } from '@/i18n';
export default function StaffLinkDialog({
  link,
  onClose,
}: {
  link: string | null;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <Dialog
      open={!!link}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          onClose();
        }
      }}
      title={t('employees.linkTitle')}
    >
      <div className="space-y-4">
        <p>{t('employees.linkOnce')}</p>
        <p dir="ltr" className="break-all select-all">
          {link}
        </p>
        <FormError message={error} />
        <Button
          onClick={() => {
            if (link)
              void navigator.clipboard
                .writeText(link)
                .catch(() => setError(t('employees.copyFailed')));
          }}
        >
          {t('employees.copy')}
        </Button>
        <a
          className="btn-link block"
          href={
            'https://wa.me/?text=' +
            encodeURIComponent(t('employees.shareMessage') + ' ' + (link ?? ''))
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('employees.whatsapp')}
        </a>
      </div>
    </Dialog>
  );
}
