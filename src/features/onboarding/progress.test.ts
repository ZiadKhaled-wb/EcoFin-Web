import { afterEach, describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS, readOnboardingProgress, saveOnboardingProgress } from './progress';

const ORG = 'a0a00000-0000-4000-8000-000000000001';
const KEY = `ecofin-onboarding-v1:${ORG}`;

describe('P02 onboarding progress (per shop, this browser)', () => {
  afterEach(() => window.localStorage.clear());

  it('starts empty, and is empty without a shop', () => {
    expect(readOnboardingProgress(ORG)).toEqual({
      version: 1,
      started: false,
      dismissed: false,
      finished: false,
      currentStep: 0,
      completedSteps: [],
    });
    expect(readOnboardingProgress(null).started).toBe(false);
  });

  it('saves and resumes per shop', () => {
    saveOnboardingProgress(ORG, {
      version: 1,
      started: true,
      dismissed: true,
      finished: false,
      currentStep: 3,
      completedSteps: ['branches', 'shop'],
    });
    const back = readOnboardingProgress(ORG);
    expect(back).toMatchObject({ started: true, dismissed: true, currentStep: 3 });
    // Steps come back in wizard order.
    expect(back.completedSteps).toEqual(['shop', 'branches']);
    expect(readOnboardingProgress('a0a00000-0000-4000-8000-000000000002').started).toBe(false);
  });

  it('cleans up stored values it does not trust', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ started: 'yes', currentStep: 99, completedSteps: ['shop', 'hack'] }),
    );
    expect(readOnboardingProgress(ORG)).toMatchObject({
      started: false,
      currentStep: ONBOARDING_STEPS.length - 1,
      completedSteps: ['shop'],
    });
    window.localStorage.setItem(KEY, '{not json');
    expect(readOnboardingProgress(ORG).completedSteps).toEqual([]);
  });
});
