import type { ZodIssueOptionalMessage } from 'zod';
import type { FieldError } from 'react-hook-form';
import { t, type TranslationKey } from '@/i18n';

/**
 * Contract schemas carry English messages, and the UI never shows them. The resolver below
 * turns every issue into a marker `i18n:<key>|<json params>`; `fieldErrorText` reads it back
 * in the language that is active when the error is drawn. A message that is not a marker
 * (a custom contract message) falls back to the generic "not valid" text.
 */
const MARKER = 'i18n:';

const encode = (key: TranslationKey, params: Record<string, string | number> = {}) =>
  `${MARKER}${key}|${JSON.stringify(params)}`;

function issueToMarker(issue: ZodIssueOptionalMessage): string {
  switch (issue.code) {
    case 'invalid_type':
      return encode(
        issue.received === 'undefined' ? 'form.errors.required' : 'form.errors.invalid',
      );
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.type === 'string') {
        return min <= 1 ? encode('form.errors.required') : encode('form.errors.tooShort', { min });
      }
      if (issue.type === 'array') return encode('form.errors.tooFewItems', { min });
      return encode('form.errors.tooSmall', { min });
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.type === 'string') return encode('form.errors.tooLong', { max });
      if (issue.type === 'array') return encode('form.errors.tooManyItems', { max });
      return encode('form.errors.tooBig', { max });
    }
    case 'invalid_string':
      return encode(
        issue.validation === 'email' ? 'form.errors.invalidEmail' : 'form.errors.invalid',
      );
    case 'invalid_enum_value':
    case 'invalid_literal':
      return encode('form.errors.invalidChoice');
    default:
      return encode('form.errors.invalid');
  }
}

/** Passed to `zodResolver(schema, { errorMap })`. Only applies where the schema has no own message. */
export const translatedErrorMap = (issue: ZodIssueOptionalMessage): { message: string } => ({
  message: issueToMarker(issue),
});

/** Same markers for issues that carry their own (English) message. */
export function markerFor(issue: ZodIssueOptionalMessage): string {
  return issueToMarker(issue);
}

/** Translated text for a field error, or undefined when there is none. */
export function fieldErrorText(error: Pick<FieldError, 'message'> | undefined): string | undefined {
  if (!error) return undefined;
  const message = error.message ?? '';
  if (message.startsWith(MARKER)) {
    const [key, json] = message.slice(MARKER.length).split('|');
    try {
      return t(key as TranslationKey, JSON.parse(json ?? '{}') as Record<string, string | number>);
    } catch {
      /* fall through to the generic text */
    }
  }
  return t('form.errors.invalid');
}
