import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, setLanguage, t } from '@/i18n';
import { ar, en } from '@/i18n/resources';

const flatten = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flatten(v as object, `${prefix}${k}.`),
  );

afterEach(async () => {
  await setLanguage('ar');
  window.localStorage.clear();
});

describe('i18n', () => {
  it('Arabic and English have exactly the same keys', () => {
    expect(flatten(en).sort()).toEqual(flatten(ar).sort());
  });

  it('is Arabic by default and keeps the {name} placeholders', () => {
    expect(getLanguage()).toBe('ar');
    expect(t('auth.errors.rateLimited', { seconds: 7 })).toContain('7');
    expect(t('auth.errors.rateLimited', { seconds: 7 })).not.toContain('{');
  });

  it('switching sets <html lang dir>, remembers the choice and translates', async () => {
    await setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(window.localStorage.getItem('ecofin-lang')).toBe('en');
    expect(t('auth.login.title')).toBe('Sign in');

    await setLanguage('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(t('auth.login.title')).toBe(ar.auth.login.title);
  });

  it('can translate into a language other than the active one', () => {
    expect(t('common.currency', undefined, 'en')).toBe('EGP');
    expect(t('common.currency', undefined, 'ar')).toBe('ج.م');
  });
});
