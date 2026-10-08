import { Link, useSearchParams } from 'react-router-dom';
import { t } from '@/i18n';

/** Keeps the setup flow one click away when an owner opens an existing settings page. */
export default function OnboardingReturnLink() {
  const [params] = useSearchParams();
  if (params.get('from') !== 'onboarding') return null;
  return (
    <Link to="/onboarding" className="btn-link mb-4 inline-flex">
      {t('onboarding.returnToWizard')}
    </Link>
  );
}
