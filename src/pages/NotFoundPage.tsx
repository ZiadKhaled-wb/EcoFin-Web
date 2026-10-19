import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import PageContainer from '@/components/ui/PageContainer';
import { AlertIcon } from '@/components/ui/Icons';
import { t } from '@/i18n';

/** 404 inside the app shell: a mistyped or old link. The URL stays as typed. */
export default function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState
        icon={<AlertIcon width={24} height={24} />}
        title={t('shell.notFound.title')}
        description={t('shell.notFound.description')}
        action={
          <Link to="/dashboard">
            <Button variant="secondary">{t('shell.notFound.back')}</Button>
          </Link>
        }
      />
    </PageContainer>
  );
}
