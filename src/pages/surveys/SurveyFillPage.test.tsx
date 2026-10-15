import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { surveysApi } from '@/services/surveysApi';
import { t, type TranslationKey } from '@/i18n';
import SurveyFillPage from './SurveyFillPage';
import { ALL_CHECKS, ALL_SCORES, GPS, OTHER_EMPLOYEE, SURVEY_ID, survey } from './surveyFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

type Position = Parameters<PositionCallback>[0];
type Locate = (ok: PositionCallback, fail?: PositionErrorCallback | null) => void;

function mockGeolocation(locate: Locate) {
  const getCurrentPosition = vi.fn(locate);
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}
const fix =
  (accuracy: number): Locate =>
  (ok) =>
    ok({
      coords: { latitude: GPS.lat, longitude: GPS.lng, accuracy },
      timestamp: Date.parse(GPS.client_captured_at),
    } as Position);
const denied: Locate = (_ok, fail) =>
  fail?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}

const renderPage = (lang: 'ar' | 'en' = 'en', id = SURVEY_ID) =>
  renderApp(
    <Routes>
      <Route path="/customers/surveys/:id/fill" element={<SurveyFillPage />} />
      <Route path="/customers/surveys/:id" element={<p>survey details</p>} />
    </Routes>,
    { lang, route: `/customers/surveys/${id}/fill` },
  );

const submitButton = () => screen.getByRole('button', { name: t('surveys.fill.submit') });

async function answerEverything(user: ReturnType<typeof userEvent.setup>) {
  for (const [key, n] of Object.entries(ALL_SCORES)) {
    const group = screen.getByRole('radiogroup', {
      name: t(`surveys.criteria.${key}` as TranslationKey),
    });
    await user.click(within(group).getByRole('radio', { name: new RegExp(`: ${n}$`) }));
  }
  for (const [key, yes] of Object.entries(ALL_CHECKS)) {
    const group = screen.getByRole('radiogroup', {
      name: t(`surveys.checklist.${key}` as TranslationKey),
    });
    await user.click(
      within(group).getByRole('radio', {
        name: yes ? t('surveys.fill.yes') : t('surveys.fill.no'),
      }),
    );
  }
}

describe('R05 survey fill page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['survey.submit']);
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    vi.spyOn(surveysApi, 'get').mockResolvedValue(survey());
    window.localStorage.clear();
    window.innerWidth = 375;
    window.dispatchEvent(new Event('resize'));
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    signOut();
  });

  it.each(['ar', 'en'] as const)('shows the phone form in %s at 375 px', async (lang) => {
    await renderPage(lang);
    expect(
      await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') }),
    ).toBeInTheDocument();
    expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    // Six criteria of ten choices each, six yes / no pairs, the visit type.
    expect(screen.getAllByRole('radiogroup')).toHaveLength(13);
    expect(
      screen.getByRole('radiogroup', { name: t('surveys.criteria.housing_quality') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: t('surveys.fill.call', { phone: '01001234567' }) }),
    ).toHaveAttribute('href', 'tel:01001234567');
    expect(screen.getByText('Ask for the electricity bill')).toBeInTheDocument();
    if (lang === 'ar') expect(screen.getByText('جودة السكن')).toBeInTheDocument();
  });

  it('keeps Submit disabled until criteria, checklist, location and a photo are there', async () => {
    const user = userEvent.setup();
    mockGeolocation(fix(12));
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') });
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(t('surveys.fill.missing.criteria'))).toBeInTheDocument();
    expect(screen.getByText(t('surveys.fill.missing.photos'))).toBeInTheDocument();

    await answerEverything(user);
    await user.click(screen.getByRole('button', { name: t('surveys.fill.location.capture') }));
    expect(await screen.findByText(t('surveys.fill.location.accuracy', { m: '12' }))).toBeVisible();
    // Everything but a photo.
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(t('surveys.fill.missing.photos'))).toBeInTheDocument();
    expect(screen.queryByText(t('surveys.fill.missing.location'))).not.toBeInTheDocument();
  });

  it('submits a complete survey after the confirm dialog and clears the local draft', async () => {
    const user = userEvent.setup();
    vi.mocked(surveysApi.get).mockResolvedValue(
      survey({ scores: ALL_SCORES, checklist: ALL_CHECKS, gps: GPS, photos_count: 1 }),
    );
    const submit = vi
      .spyOn(surveysApi, 'submit')
      .mockResolvedValue(survey({ status: 'submitted', survey_score: 70 }));
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') });
    await user.click(submitButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('surveys.fill.submit') }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(SURVEY_ID, {}));
    expect(await screen.findByText('survey details')).toBeInTheDocument();
    expect(window.localStorage.getItem(`ecotech.survey-draft.${SURVEY_ID}`)).toBeNull();
  });

  it('warns about a fix less accurate than 100 m and offers to try again', async () => {
    const user = userEvent.setup();
    const locate = mockGeolocation(fix(150));
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') });
    await user.click(screen.getByRole('button', { name: t('surveys.fill.location.capture') }));
    expect(await screen.findByText(t('surveys.fill.location.low', { m: '100' }))).toBeVisible();
    expect(locate).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
    await user.click(screen.getByRole('button', { name: t('surveys.fill.location.retry') }));
    expect(locate).toHaveBeenCalledTimes(2);
  });

  it('explains a denied location and keeps Submit disabled', async () => {
    const user = userEvent.setup();
    vi.mocked(surveysApi.get).mockResolvedValue(
      survey({ scores: ALL_SCORES, checklist: ALL_CHECKS, photos_count: 1 }),
    );
    mockGeolocation(denied);
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') });
    await user.click(screen.getByRole('button', { name: t('surveys.fill.location.capture') }));
    expect(await screen.findByText(t('surveys.fill.location.denied'))).toBeVisible();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(t('surveys.fill.missing.location'))).toBeInTheDocument();
  });

  it('uploads each photo at once with purpose survey_photo on the survey', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        id: 'a0750000-0000-4000-8000-0000000000f1',
        purpose: 'survey_photo',
        mime: 'image/jpeg',
        sizeBytes: 3,
        originalName: 'door.jpg',
        entityType: 'field_survey',
        entityId: SURVEY_ID,
        createdAt: '2026-10-16T10:00:00.000Z',
      },
    });
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') });
    const input = screen.getByLabelText(t('surveys.fill.photos.add'), { selector: 'input' });
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');
    await user.upload(input, new File(['abc'], 'door.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, form] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe('/api/files');
    expect(form.get('purpose')).toBe('survey_photo');
    expect(form.get('entityType')).toBe('field_survey');
    expect(form.get('entityId')).toBe(SURVEY_ID);
    expect(await screen.findByText(t('surveys.fill.photos.uploaded'))).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: t('surveys.fill.photos.preview', { n: '1' }) }),
    ).toHaveAttribute('src', 'blob:preview');
  });

  it('saves only the keys that changed', async () => {
    const user = userEvent.setup();
    vi.mocked(surveysApi.get).mockResolvedValue(
      survey({ scores: { housing_quality: 5, neighbourhood: 6 }, notes: 'First visit' }),
    );
    const save = vi.spyOn(surveysApi, 'save').mockResolvedValue(survey());
    await renderPage();
    await screen.findByRole('heading', { level: 1, name: t('surveys.fill.title') });
    const group = screen.getByRole('radiogroup', { name: t('surveys.criteria.housing_quality') });
    await user.click(within(group).getByRole('radio', { name: /: 8$/ }));
    await user.click(screen.getByRole('button', { name: t('surveys.fill.save') }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(SURVEY_ID, { scores: { housing_quality: 8 } }),
    );
  });

  it('keeps unsaved answers on the device and restores them', async () => {
    window.localStorage.setItem(
      `ecotech.survey-draft.${SURVEY_ID}`,
      JSON.stringify({ visit_type: 'work', scores: { job_status: 9 }, checklist: {}, notes: '' }),
    );
    await renderPage();
    expect(await screen.findByText(t('surveys.fill.draftRestored'))).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: t('surveys.criteria.job_status') });
    expect(within(group).getByRole('radio', { name: /: 9$/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('never calls the API for an id that is not a UUID', async () => {
    await renderPage('en', 'not-a-uuid');
    expect(await screen.findByText(t('surveys.page.notFound'))).toBeInTheDocument();
    expect(surveysApi.get).not.toHaveBeenCalled();
  });

  it('refuses a survey assigned to someone else', async () => {
    vi.mocked(surveysApi.get).mockResolvedValue(
      survey({ assigned_to: { id: OTHER_EMPLOYEE, full_name: 'Collector One' } }),
    );
    await renderPage();
    expect(await screen.findByText(t('surveys.fill.notAssignee'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('surveys.fill.submit') })).toBeNull();
  });
});
