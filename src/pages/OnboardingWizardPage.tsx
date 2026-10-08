import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import {
  ONBOARDING_STEPS,
  readOnboardingProgress,
  saveOnboardingProgress,
  type OnboardingProgress,
  type OnboardingStep,
} from '@/features/onboarding/progress';

const destinations: Record<OnboardingStep, string> = {
  shop: '/settings?tab=general&from=onboarding',
  tax: '/settings/profile?from=onboarding',
  branches: '/settings/branches?from=onboarding',
  vaults: '/settings/branches?from=onboarding',
  receipt: '/settings?tab=receipt&from=onboarding',
  installments: '/settings?tab=installments&from=onboarding',
  employees: '/settings/employees?from=onboarding',
};

export default function OnboardingWizardPage() {
  const orgId = useAuthStore((state) => state.orgId);
  const role = useAuthStore((state) => state.user?.role);
  const navigate = useNavigate();
  const [progress, setProgress] = useState(() => readOnboardingProgress(orgId));

  if (!orgId || role !== 'OWNER') return <Navigate to="/dashboard" replace />;

  const current = ONBOARDING_STEPS[progress.currentStep] ?? ONBOARDING_STEPS[0];
  const completedCount = progress.completedSteps.length;
  const complete = progress.finished;

  function update(change: Partial<OnboardingProgress>) {
    const next = { ...progress, ...change, started: true, dismissed: false };
    saveOnboardingProgress(orgId, next);
    setProgress(next);
  }

  function selectStep(index: number) {
    update({ currentStep: index });
  }

  function markComplete(step: OnboardingStep) {
    const completedSteps = ONBOARDING_STEPS.filter(
      (item) => item === step || progress.completedSteps.includes(item),
    );
    const nextIndex = Math.min(progress.currentStep + 1, ONBOARDING_STEPS.length - 1);
    const finished = completedSteps.length === ONBOARDING_STEPS.length;
    update({ completedSteps, currentStep: nextIndex, finished });
  }

  function skipStep() {
    update({ currentStep: Math.min(progress.currentStep + 1, ONBOARDING_STEPS.length - 1) });
  }

  function leaveForNow() {
    const next = { ...progress, dismissed: true, started: true };
    saveOnboardingProgress(orgId, next);
    setProgress(next);
    navigate('/dashboard');
  }

  function finish() {
    const next = { ...progress, finished: true, dismissed: false, started: true };
    saveOnboardingProgress(orgId, next);
    setProgress(next);
    navigate('/dashboard');
  }

  const percentage = Math.round((completedCount / ONBOARDING_STEPS.length) * 100);

  return (
    <PageContainer>
      <PageHeader
        title={t('onboarding.title')}
        description={t('onboarding.description')}
        actions={
          <Button variant="secondary" onClick={leaveForNow}>
            {t('onboarding.skipSetup')}
          </Button>
        }
      />

      {complete ? (
        <Card
          title={t('onboarding.completeTitle')}
          description={t('onboarding.completeDescription')}
        >
          <Link className="btn-primary inline-flex" to="/dashboard">
            {t('onboarding.goToDashboard')}
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <Card title={t('onboarding.stepsTitle')}>
            <div className="mb-5 space-y-2">
              <div className="flex justify-between gap-3">
                <span className="type-caption">{t('onboarding.progress')}</span>
                <span className="type-caption">
                  {t('onboarding.progressCount', {
                    done: completedCount,
                    total: ONBOARDING_STEPS.length,
                  })}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-field"
                role="progressbar"
                aria-label={t('onboarding.progress')}
                aria-valuemin={0}
                aria-valuemax={ONBOARDING_STEPS.length}
                aria-valuenow={completedCount}
              >
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width]"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            <ol className="space-y-2">
              {ONBOARDING_STEPS.map((step, index) => {
                const done = progress.completedSteps.includes(step);
                return (
                  <li key={step}>
                    <button
                      type="button"
                      aria-current={current === step ? 'step' : undefined}
                      onClick={() => selectStep(index)}
                      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-md border px-3 text-start ${
                        current === step
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-line hover:bg-field'
                      }`}
                    >
                      <span className="type-body">
                        <span aria-hidden="true" className="me-2">
                          {done ? '✓' : `${index + 1}.`}
                        </span>
                        {t(`onboarding.steps.${step}.title`)}
                      </span>
                      {done && (
                        <span className="type-caption text-brand-700">{t('onboarding.done')}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card
            title={t(`onboarding.steps.${current}.title`)}
            description={t(`onboarding.steps.${current}.description`)}
          >
            {current === 'vaults' && (
              <p className="mb-4 rounded-md border border-line bg-field p-3 type-caption">
                {t('onboarding.vaultNote')}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link className="btn-primary inline-flex" to={destinations[current]}>
                {t(`onboarding.steps.${current}.action`)}
              </Link>
              <Button variant="secondary" onClick={() => markComplete(current)}>
                {t('onboarding.markDone')}
              </Button>
              <Button variant="ghost" onClick={skipStep}>
                {t('onboarding.skipStep')}
              </Button>
            </div>
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
              <Button
                variant="ghost"
                disabled={progress.currentStep === 0}
                onClick={() => selectStep(Math.max(0, progress.currentStep - 1))}
              >
                {t('onboarding.previous')}
              </Button>
              {completedCount === ONBOARDING_STEPS.length ? (
                <Button onClick={finish}>{t('onboarding.finish')}</Button>
              ) : (
                <Button
                  variant="ghost"
                  disabled={progress.currentStep === ONBOARDING_STEPS.length - 1}
                  onClick={() =>
                    selectStep(Math.min(progress.currentStep + 1, ONBOARDING_STEPS.length - 1))
                  }
                >
                  {t('onboarding.next')}
                </Button>
              )}
            </div>
            <p className="type-caption mt-4">{t('onboarding.resumeNote')}</p>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
