export const ONBOARDING_STEPS = [
  'shop',
  'tax',
  'branches',
  'vaults',
  'receipt',
  'installments',
  'employees',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingProgress {
  version: 1;
  started: boolean;
  dismissed: boolean;
  finished: boolean;
  currentStep: number;
  completedSteps: OnboardingStep[];
}

const emptyProgress = (): OnboardingProgress => ({
  version: 1,
  started: false,
  dismissed: false,
  finished: false,
  currentStep: 0,
  completedSteps: [],
});

const storageKey = (orgId: string) => `ecofin-onboarding-v1:${orgId}`;

export function readOnboardingProgress(orgId: string | null): OnboardingProgress {
  if (!orgId) return emptyProgress();
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (!raw) return emptyProgress();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyProgress();
    const saved = value as Partial<OnboardingProgress>;
    return {
      version: 1,
      started: saved.started === true,
      dismissed: saved.dismissed === true,
      finished: saved.finished === true,
      currentStep:
        typeof saved.currentStep === 'number' && Number.isInteger(saved.currentStep)
          ? Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, saved.currentStep))
          : 0,
      completedSteps: Array.isArray(saved.completedSteps)
        ? ONBOARDING_STEPS.filter((step) => saved.completedSteps?.includes(step))
        : [],
    };
  } catch {
    return emptyProgress();
  }
}

export function saveOnboardingProgress(orgId: string | null, progress: OnboardingProgress): void {
  if (!orgId) return;
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(progress));
  } catch {
    // The wizard remains usable for this visit if browser storage is unavailable.
  }
}
