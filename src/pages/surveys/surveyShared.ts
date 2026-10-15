import {
  SURVEY_CHECKLIST,
  SURVEY_CRITERIA,
  SurveyChecklist,
  SurveyGps,
  SurveyScores,
  SurveyVisitType,
  type Survey,
  type SurveyAnswersInput,
  type SurveyChecklistItem,
  type SurveyCriterion,
  type SurveyStatus,
} from '@ziadkhaled-wb/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { SURVEY_DRAFT_PREFIX } from '@/lib/surveyDraftStore';
import { t, type TranslationKey } from '@/i18n';

/** The contract's limits on the free-text fields (shown and checked before sending). */
export const NOTES_MAX = 2000;
export const INSTRUCTIONS_MAX = 500;
export const DECISION_NOTE_MAX = 500;
export const CANCEL_REASON_MAX = 300;

export const STATUS_TONE: Record<SurveyStatus, BadgeTone> = {
  assigned: 'brand',
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const statusLabel = (status: SurveyStatus) => t(`surveys.status.${status}`);
export const visitTypeLabel = (type: SurveyVisitType) => t(`surveys.visitType.${type}`);
export const criterionLabel = (key: SurveyCriterion) => t(`surveys.criteria.${key}`);
export const checklistLabel = (key: SurveyChecklistItem) => t(`surveys.checklist.${key}`);

/** The survey pages follow their menu item: any of the three survey keys (links elsewhere too). */
export function useCanOpenSurveys(): boolean {
  const assign = useCan('survey.assign');
  const submit = useCan('survey.submit');
  const decide = useCan('survey.decide');
  return assign || submit || decide;
}

const ERRORS: Partial<Record<string, TranslationKey>> = {
  SURVEY_NOT_FOUND: 'surveys.errors.SURVEY_NOT_FOUND',
  SURVEY_ALREADY_OPEN: 'surveys.errors.SURVEY_ALREADY_OPEN',
  SURVEY_ASSIGNEE_INVALID: 'surveys.errors.SURVEY_ASSIGNEE_INVALID',
  SURVEY_NOT_ASSIGNEE: 'surveys.errors.SURVEY_NOT_ASSIGNEE',
  SURVEY_WRONG_STATUS: 'surveys.errors.SURVEY_WRONG_STATUS',
  SURVEY_PHOTO_REQUIRED: 'surveys.errors.SURVEY_PHOTO_REQUIRED',
  SURVEY_SELF_DECISION: 'surveys.errors.SURVEY_SELF_DECISION',
  SURVEY_REQUIRED: 'surveys.errors.SURVEY_REQUIRED',
  CUSTOMER_NOT_FOUND: 'surveys.errors.CUSTOMER_NOT_FOUND',
  CUSTOMER_BLOCKED: 'surveys.errors.CUSTOMER_BLOCKED',
  PERMISSION_DENIED: 'surveys.errors.PERMISSION_DENIED',
  MODULE_NOT_IN_PLAN: 'surveys.errors.MODULE_NOT_IN_PLAN',
  SUBSCRIPTION_EXPIRED: 'surveys.errors.SUBSCRIPTION_EXPIRED',
  FILE_TYPE_NOT_ALLOWED: 'surveys.errors.FILE_TYPE_NOT_ALLOWED',
  FILE_TOO_LARGE: 'surveys.errors.FILE_TOO_LARGE',
  VALIDATION_FAILED: 'surveys.errors.VALIDATION_FAILED',
};

/** The words for a refused survey call. */
export const surveyError = (err: unknown): string =>
  t(ERRORS[err instanceof ApiError ? err.code : ''] ?? 'surveys.errors.failed');

/** Opens Google Maps on the captured point (a plain link, nothing embedded). */
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Overdue: still waiting for the visit and the due date is before the shop's today. */
export const isOverdue = (survey: Survey, today: string): boolean =>
  survey.status === 'assigned' && survey.due_date !== null && survey.due_date < today;

/** The answers as the fill page holds them. */
export interface SurveyDraft {
  visit_type: SurveyVisitType;
  scores: SurveyScores;
  checklist: SurveyChecklist;
  notes: string;
  gps: SurveyGps | null;
}

export const draftFromSurvey = (s: Survey): SurveyDraft => ({
  visit_type: s.visit_type,
  scores: { ...s.scores },
  checklist: { ...s.checklist },
  notes: s.notes ?? '',
  gps: s.gps,
});

const sameGps = (a: SurveyGps | null, b: SurveyGps | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.gps_accuracy_m === b.gps_accuracy_m &&
    a.client_captured_at === b.client_captured_at);

/**
 * Only what changed against the saved survey: a criterion or item that was answered and is now
 * empty is sent as `null` (the server removes it). An empty object means nothing to save.
 */
export function changedAnswers(draft: SurveyDraft, saved: Survey): SurveyAnswersInput {
  const body: SurveyAnswersInput = {};
  if (draft.visit_type !== saved.visit_type) body.visit_type = draft.visit_type;

  const scores: Partial<Record<SurveyCriterion, number | null>> = {};
  for (const key of SURVEY_CRITERIA) {
    const now = draft.scores[key];
    if (now !== saved.scores[key]) scores[key] = now ?? null;
  }
  if (Object.keys(scores).length > 0) body.scores = scores;

  const checklist: Partial<Record<SurveyChecklistItem, boolean | null>> = {};
  for (const key of SURVEY_CHECKLIST) {
    const now = draft.checklist[key];
    if (now !== saved.checklist[key]) checklist[key] = now ?? null;
  }
  if (Object.keys(checklist).length > 0) body.checklist = checklist;

  const notes = draft.notes.trim() === '' ? null : draft.notes.trim();
  if (notes !== (saved.notes ?? null)) body.notes = notes;

  if (!sameGps(draft.gps, saved.gps)) body.gps = draft.gps;
  return body;
}

export type MissingPart = 'criteria' | 'checklist' | 'location' | 'photos';

/** What the server will refuse a submit for, in the order the page shows it. */
export function missingParts(draft: SurveyDraft, photos: number): MissingPart[] {
  const out: MissingPart[] = [];
  if (SURVEY_CRITERIA.some((k) => draft.scores[k] === undefined)) out.push('criteria');
  if (SURVEY_CHECKLIST.some((k) => draft.checklist[k] === undefined)) out.push('checklist');
  if (!draft.gps) out.push('location');
  if (photos < 1) out.push('photos');
  return out;
}

// Unsaved answers stay on this device per survey, so a dropped connection loses nothing. Storage
// can be missing or full (private mode): every access is wrapped and failing is never fatal.
// A draft remembers the survey version it was made on (`updated_at`): once the survey changed on
// the server (saved from another device, reassigned, cancelled), the old draft is dropped instead
// of overwriting newer answers. Drafts hold the customer's location and notes, so signing out
// removes them all (clearAllSurveyDrafts).
const draftKey = (id: string) => `${SURVEY_DRAFT_PREFIX}${id}`;

/** The draft made on this version of the survey, or null (none, unreadable or outdated). */
export function loadDraft(id: string, version: string): SurveyDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    if (!raw) return null;
    // Whatever is stored is checked against the contract again; anything odd is dropped.
    const stored = JSON.parse(raw) as { version?: unknown; draft?: unknown } | null;
    if (!stored || typeof stored !== 'object' || stored.version !== version) {
      clearDraft(id);
      return null;
    }
    const value = stored.draft as Record<string, unknown> | null;
    if (!value || typeof value !== 'object') return null;
    const visit = SurveyVisitType.safeParse(value.visit_type);
    if (!visit.success) return null;
    const scores = SurveyScores.safeParse(value.scores);
    const checklist = SurveyChecklist.safeParse(value.checklist);
    const gps = SurveyGps.safeParse(value.gps);
    return {
      visit_type: visit.data,
      scores: scores.success ? scores.data : {},
      checklist: checklist.success ? checklist.data : {},
      notes: typeof value.notes === 'string' ? value.notes.slice(0, NOTES_MAX) : '',
      gps: gps.success ? gps.data : null,
    };
  } catch {
    return null;
  }
}

export function storeDraft(id: string, version: string, draft: SurveyDraft): void {
  try {
    window.localStorage.setItem(draftKey(id), JSON.stringify({ version, draft }));
  } catch {
    // Storage unavailable: the answers stay in memory only.
  }
}

export function clearDraft(id: string): void {
  try {
    window.localStorage.removeItem(draftKey(id));
  } catch {
    // Nothing to clear.
  }
}
