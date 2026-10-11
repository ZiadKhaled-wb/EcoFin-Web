import { describe, expect, it } from 'vitest';

/**
 * UI audit (11 Oct 2026): class names that look like design-system classes but do not exist
 * rendered bare, unstyled controls (the shop profile fields, the expense category field, the
 * setup button). The theme in index.css has no `input`, `rounded-card`, `bg-canvas`, `warning-*`
 * or `danger-700`; buttons need `btn` next to `btn-primary`.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/className="input[ "]/, 'use the field-input class (or the Input / Textarea components)'],
  [/\brounded-card\b/, 'use rounded-control'],
  [/\bbg-canvas\b/, 'use bg-paper'],
  [/\b(text|border|bg)-warning-\d+/, 'the warning colour is ochre'],
  [/\b(text|border|bg)-danger(?![-\w])/, 'use danger-50 or danger-600'],
  [/\b(text|border|bg)-danger-(?!50\b|600\b)\d+/, 'only danger-50 and danger-600 exist'],
  [/\bnotice-danger\b/, 'use notice-error'],
  [/className="btn-(primary|secondary|ghost|danger)\b/, 'a button needs btn as well'],
];

const modules = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('class names used by the screens exist in the theme', () => {
  it('scans the screens', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(50);
  });
  it.each(FORBIDDEN)('no %s', (pattern, hint) => {
    const hits = Object.entries(modules)
      .filter(([, text]) => pattern.test(text))
      .map(([file]) => file);
    expect(hits, hint).toEqual([]);
  });
});
