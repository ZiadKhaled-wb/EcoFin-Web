import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import PageContainer from '@/components/ui/PageContainer';
import { t } from '@/i18n';

/** Dev-only page behind `audit.view`, used to prove the permission guard. */
export default function RestrictedSamplePage() {
  return (
    <PageContainer>
      <PageHeader title={t('sample.restricted.title')} />
      <Card>
        <p className="type-body">{t('sample.restricted.body')}</p>
      </Card>
    </PageContainer>
  );
}
