import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { surveysApi } from '@/services/surveysApi';
import { t } from '@/i18n';
import SurveysPage from './SurveysPage';
import { submittedSurvey, survey } from './surveyFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const renderPage = (lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/surveys" element={<SurveysPage />} />
    </Routes>,
    { lang, route: '/customers/surveys' },
  );

describe('R05 surveys page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(surveysApi, 'list').mockResolvedValue({
      items: [survey({ due_date: '2020-01-01' }), submittedSurvey()],
      page: 1,
      pageSize: 25,
      total: 2,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    signOut();
  });

  it('gives a collector only their own surveys, with no tabs', async () => {
    setPermissions(['survey.submit']);
    await renderPage('ar');
    expect(await screen.findAllByText('Ahmed Ali Hassan')).toHaveLength(2);
    expect(surveysApi.list).toHaveBeenCalledWith({ mine: true, page: 1, pageSize: 25 });
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('opens the review queue for a decider and switches tabs', async () => {
    const user = userEvent.setup();
    setPermissions(['survey.decide', 'survey.assign']);
    await renderPage();
    await screen.findAllByText('Ahmed Ali Hassan');
    expect(surveysApi.list).toHaveBeenCalledWith({ status: 'submitted', page: 1, pageSize: 25 });
    expect(screen.queryByRole('tab', { name: t('surveys.list.tabs.mine') })).toBeNull();
    await user.click(screen.getByRole('tab', { name: t('surveys.list.tabs.all') }));
    await waitFor(() => expect(surveysApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 25 }));
  });

  it('marks an overdue visit and shows the status and score', async () => {
    setPermissions(['survey.assign']);
    await renderPage();
    expect(await screen.findByText(t('surveys.list.overdue'))).toBeInTheDocument();
    expect(screen.getByText(t('surveys.status.submitted'))).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
  });
});
