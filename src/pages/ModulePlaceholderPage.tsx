import { useLocation } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import PageContainer from '@/components/ui/PageContainer';
import { navLeaves } from '@/config/navigation';
import { t } from '@/i18n';

/** Stand-in for every menu item whose module is not built yet. Delete a route when its module lands. */
export default function ModulePlaceholderPage() {
  const { pathname } = useLocation();
  const label = (() => {
    const item = navLeaves().find((i) => i.to === pathname);
    return item ? t(item.labelKey) : t('shell.placeholder.fallbackName');
  })();
  return (
    <PageContainer>
      <PageHeader
        title={label}
        breadcrumbs={[{ label: t('shell.home'), to: '/dashboard' }, { label }]}
      />
      <Card padded={false}>
        <EmptyState
          title={t('shell.placeholder.title')}
          description={t('shell.placeholder.description')}
        />
      </Card>
    </PageContainer>
  );
}
