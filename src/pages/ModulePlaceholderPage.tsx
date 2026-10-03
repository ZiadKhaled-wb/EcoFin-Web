import { useLocation } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import PageContainer from '@/components/ui/PageContainer';
import { navLeaves } from '@/config/navigation';

/** Stand-in for every menu item whose module is not built yet. Delete a route when its module lands. */
export default function ModulePlaceholderPage() {
  const { pathname } = useLocation();
  const label = navLeaves().find((i) => i.to === pathname)?.label ?? 'الوحدة';
  return (
    <PageContainer>
      <PageHeader
        title={label}
        breadcrumbs={[{ label: 'الرئيسية', to: '/dashboard' }, { label }]}
      />
      <Card padded={false}>
        <EmptyState
          title="هذه الوحدة قيد الإنشاء"
          description="ستظهر هنا بياناتك وأدواتك فور اكتمال الوحدة."
        />
      </Card>
    </PageContainer>
  );
}
