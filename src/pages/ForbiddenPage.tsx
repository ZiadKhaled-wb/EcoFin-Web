import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import PageContainer from '@/components/ui/PageContainer';
import { AlertIcon } from '@/components/ui/Icons';
import { t } from '@/i18n';

/** 403: the user is signed in but lacks the permission. The URL stays as typed. */
export default function ForbiddenPage() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        tone="danger"
        icon={<AlertIcon width={24} height={24} />}
        title={t('shell.forbidden.title')}
        description={t('shell.forbidden.description')}
        action={
          <Link to="/dashboard">
            <Button variant="secondary">{t('shell.forbidden.back')}</Button>
          </Link>
        }
      />
    </PageContainer>
  );
}
