import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { meApi } from '@/features/me/meApi';
import { readOnboardingProgress, saveOnboardingProgress } from '@/features/onboarding/progress';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { ORG_A } from '@/test/authFixtures';
import { t } from '@/i18n';
import OnboardingWizardPage from './OnboardingWizardPage';
import DashboardPage from './DashboardPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

function app() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingWizardPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  );
}
const stepButton = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('P02 onboarding wizard', () => {
  beforeEach(() => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture([]));
  });
  afterEach(() => {
    signOut();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each(['ar', 'en'] as const)(
    'lists the seven steps and links each to its page (%s)',
    async (lang) => {
      signIn('OWNER');
      await renderApp(app(), { lang, route: '/onboarding' });
      await screen.findByRole('heading', { name: t('onboarding.title') });
      for (const step of [
        'shop',
        'tax',
        'branches',
        'vaults',
        'receipt',
        'installments',
        'employees',
      ] as const) {
        expect(stepButton(t(`onboarding.steps.${step}.title`))).toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: t('onboarding.steps.shop.action') })).toHaveAttribute(
        'href',
        '/settings?tab=general&from=onboarding',
      );
      expect(
        screen.getByText(t('onboarding.progressCount', { done: 0, total: 7 })),
      ).toBeInTheDocument();
    },
  );

  it('marks steps done, moves on, and saves the progress to resume later', async () => {
    signIn('OWNER');
    await renderApp(app(), { lang: 'en', route: '/onboarding' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('onboarding.markDone') }));
    expect(
      screen.getByText(t('onboarding.progressCount', { done: 1, total: 7 })),
    ).toBeInTheDocument();
    expect(stepButton(t('onboarding.steps.tax.title'))).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: t('onboarding.steps.tax.action') })).toHaveAttribute(
      'href',
      '/settings/profile?from=onboarding',
    );
    await user.click(screen.getByRole('button', { name: t('onboarding.skipStep') }));
    expect(stepButton(t('onboarding.steps.branches.title'))).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(readOnboardingProgress(ORG_A)).toMatchObject({
      started: true,
      currentStep: 2,
      completedSteps: ['shop'],
    });
  });

  it('pausing goes to the dashboard, which offers to resume', async () => {
    signIn('OWNER');
    await renderApp(app(), { lang: 'en', route: '/onboarding' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('onboarding.skipSetup') }));
    expect(await screen.findByRole('link', { name: t('onboarding.resumeSetup') })).toHaveAttribute(
      'href',
      '/onboarding',
    );
    expect(readOnboardingProgress(ORG_A).dismissed).toBe(true);
  });

  it('finishing the checklist ends it, and the dashboard card goes away', async () => {
    signIn('OWNER');
    saveOnboardingProgress(ORG_A, {
      version: 1,
      started: true,
      dismissed: false,
      finished: false,
      currentStep: 6,
      completedSteps: ['shop', 'tax', 'branches', 'vaults', 'receipt', 'installments'],
    });
    await renderApp(app(), { lang: 'en', route: '/onboarding' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('onboarding.markDone') }));
    // The last step completes the checklist.
    expect(await screen.findByText(t('onboarding.completeTitle'))).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: t('onboarding.goToDashboard') }));
    await screen.findByRole('heading', { name: t('nav.dashboard') });
    expect(
      screen.queryByRole('link', { name: t('onboarding.resumeSetup') }),
    ).not.toBeInTheDocument();
    expect(readOnboardingProgress(ORG_A).finished).toBe(true);
  });

  it('is for the owner only: anyone else lands on the dashboard without the card', async () => {
    signIn('CASHIER');
    await renderApp(app(), { lang: 'en', route: '/onboarding' });
    await screen.findByRole('heading', { name: t('nav.dashboard') });
    expect(screen.queryByText(t('onboarding.stepsTitle'))).not.toBeInTheDocument();
  });

  it('the dashboard never redirects an owner by itself (new device, e2e logins)', async () => {
    signIn('OWNER');
    await renderApp(app(), { lang: 'en', route: '/dashboard' });
    const card = await screen.findByText(t('onboarding.stepsTitle'));
    expect(card).toBeInTheDocument();
    expect(
      within(document.body).getByRole('link', { name: t('onboarding.title') }),
    ).toHaveAttribute('href', '/onboarding');
    expect(
      screen.queryByRole('button', { name: t('onboarding.markDone') }),
    ).not.toBeInTheDocument();
  });
});
