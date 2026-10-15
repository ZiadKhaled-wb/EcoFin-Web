import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meApi } from '@/features/me/meApi';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { surveysApi } from '@/services/surveysApi';
import { t } from '@/i18n';
import SurveyPage from './SurveyPage';
import { GPS, SURVEY_ID, submittedSurvey, survey } from './surveyFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const renderPage = (lang: 'ar' | 'en' = 'en', id = SURVEY_ID) =>
  renderApp(
    <Routes>
      <Route path="/customers/surveys/:id" element={<SurveyPage />} />
    </Routes>,
    { lang, route: `/customers/surveys/${id}` },
  );
const heading = () =>
  screen.findByRole('heading', {
    level: 1,
    name: t('surveys.page.title', { name: 'Ahmed Ali Hassan' }),
  });

describe('R05 survey page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(surveysApi, 'get').mockResolvedValue(submittedSurvey());
    vi.spyOn(surveysApi, 'photos').mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    signOut();
  });

  it('shows the answers, the score, the map link and the low accuracy warning', async () => {
    setPermissions(['survey.decide']);
    vi.mocked(surveysApi.get).mockResolvedValue(
      submittedSurvey({ gps: { ...GPS, gps_accuracy_m: 150 }, gps_low_accuracy: true }),
    );
    await renderPage();
    await heading();
    expect(screen.getByText(t('surveys.page.scoreValue', { score: '70' }))).toBeInTheDocument();
    expect(screen.getByText(t('surveys.criteria.job_status'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('surveys.page.openMaps') })).toHaveAttribute(
      'href',
      `https://www.google.com/maps?q=${GPS.lat},${GPS.lng}`,
    );
    expect(screen.getByText(t('surveys.page.lowAccuracy', { m: '100' }))).toBeInTheDocument();
    // Without customer.view_pii the photos are only counted.
    expect(screen.getByText(t('surveys.page.photosHidden'))).toBeInTheDocument();
    expect(surveysApi.photos).not.toHaveBeenCalled();
  });

  it('needs a note to reject, then sends the decision', async () => {
    const user = userEvent.setup();
    setPermissions(['survey.decide']);
    const decide = vi
      .spyOn(surveysApi, 'decide')
      .mockResolvedValue(submittedSurvey({ status: 'rejected', decision_note: 'Wrong address' }));
    await renderPage();
    await heading();
    await user.click(screen.getByRole('button', { name: t('surveys.page.reject') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('surveys.decide.confirmReject') }),
    );
    expect(await within(dialog).findByText(t('surveys.decide.noteRequired'))).toBeVisible();
    expect(decide).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(t('surveys.decide.note')), 'Wrong address');
    await user.click(
      within(dialog).getByRole('button', { name: t('surveys.decide.confirmReject') }),
    );
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(SURVEY_ID, { decision: 'reject', note: 'Wrong address' }),
    );
  });

  it('approves without a note', async () => {
    const user = userEvent.setup();
    setPermissions(['survey.decide']);
    const decide = vi
      .spyOn(surveysApi, 'decide')
      .mockResolvedValue(submittedSurvey({ status: 'approved' }));
    await renderPage();
    await heading();
    await user.click(screen.getByRole('button', { name: t('surveys.page.approve') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('surveys.decide.confirmApprove') }),
    );
    await waitFor(() => expect(decide).toHaveBeenCalledWith(SURVEY_ID, { decision: 'approve' }));
  });

  it('gives a collector Fill on their own survey and no Approve', async () => {
    setPermissions(['survey.submit']);
    vi.mocked(surveysApi.get).mockResolvedValue(survey());
    await renderPage('ar');
    await heading();
    expect(screen.getByRole('link', { name: t('surveys.page.fill') })).toHaveAttribute(
      'href',
      `/customers/surveys/${SURVEY_ID}/fill`,
    );
    expect(screen.queryByRole('button', { name: t('surveys.page.approve') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('surveys.page.reassign') })).toBeNull();
  });

  it("hides Approve on the decider's own survey unless they are the owner", async () => {
    setPermissions(['survey.decide', 'survey.submit']);
    vi.mocked(surveysApi.get).mockResolvedValue(
      submittedSurvey({ assigned_to: { id: meFixture().employee.id, full_name: 'Test User' } }),
    );
    signIn('CASHIER');
    await renderPage();
    await heading();
    expect(screen.queryByRole('button', { name: t('surveys.page.approve') })).toBeNull();
  });

  it('shows Approve only once it knows who is signed in', async () => {
    setPermissions(['survey.decide']);
    let resolveMe: (v: ReturnType<typeof meFixture>) => void = () => {};
    vi.mocked(meApi.me).mockReturnValue(new Promise((r) => (resolveMe = r)));
    await renderPage();
    await heading();
    expect(screen.queryByRole('button', { name: t('surveys.page.approve') })).toBeNull();
    resolveMe(meFixture());
    expect(await screen.findByRole('button', { name: t('surveys.page.approve') })).toBeVisible();
  });

  it('cancels with a reason', async () => {
    const user = userEvent.setup();
    setPermissions(['survey.assign']);
    const cancel = vi
      .spyOn(surveysApi, 'cancel')
      .mockResolvedValue(submittedSurvey({ status: 'cancelled' }));
    await renderPage();
    await heading();
    await user.click(screen.getByRole('button', { name: t('surveys.page.cancel') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('surveys.cancelDialog.reason')), 'Moved away');
    await user.click(
      within(dialog).getByRole('button', { name: t('surveys.cancelDialog.confirm') }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(SURVEY_ID, { reason: 'Moved away' }));
  });

  it('never calls the API for an id that is not a UUID', async () => {
    setPermissions(['survey.decide']);
    await renderPage('en', '123');
    expect(await screen.findByText(t('surveys.page.notFound'))).toBeInTheDocument();
    expect(surveysApi.get).not.toHaveBeenCalled();
  });
});
