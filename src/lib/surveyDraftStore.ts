// R05: the fill page keeps unsaved survey answers on the device under this prefix (surveyShared).
// They hold customers' locations and notes, so the session store clears them on sign-out and on
// a new sign-in. No imports here: the auth store loads this file.
export const SURVEY_DRAFT_PREFIX = 'ecotech.survey-draft.';

/** Removes every survey draft from this device. Storage may be unavailable: never fatal. */
export function clearAllSurveyDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(SURVEY_DRAFT_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}
