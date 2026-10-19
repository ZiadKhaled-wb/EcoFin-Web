import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import PageContainer from '@/components/ui/PageContainer';
import { AlertIcon } from '@/components/ui/Icons';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

/** 403: the user is signed in but lacks the permission. The URL stays as typed. */
export default function ForbiddenPage() {
  // The owner can't "ask the owner": the page is simply not one their role works on.
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        tone="danger"
        icon={<AlertIcon width={24} height={24} />}
        title={t('shell.forbidden.title')}
        description={t(
          isOwner ? 'shell.forbidden.ownerDescription' : 'shell.forbidden.description',
        )}
        action={
          <Link to="/dashboard">
            <Button variant="secondary">{t('shell.forbidden.back')}</Button>
          </Link>
        }
      />
    </PageContainer>
  );
}
