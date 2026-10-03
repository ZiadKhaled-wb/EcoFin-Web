/** aria-describedby value for a control wrapped by FieldShell. */
export function describedBy(id: string, error?: string, help?: string) {
  return [error && `${id}-error`, help && `${id}-help`].filter(Boolean).join(' ') || undefined;
}
