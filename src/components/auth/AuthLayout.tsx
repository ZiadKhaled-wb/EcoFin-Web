import type { ReactNode } from 'react';
import SubmitButton from '@/components/ui/SubmitButton';
import Wordmark from '@/components/ui/Wordmark';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

interface Props {
  title: string;
  subtitle?: string;
  /** Org context slot. */
  context?: ReactNode;
  /** Loading slot: replaces the form while something resolves. */
  loading?: boolean;
  loadingLabel?: string;
  /** Terminal error slot: replaces the form, always offers a way out. */
  terminalError?: { message: string; actionLabel: string; onAction: () => void };
  /** Wider card for long forms. */
  wide?: boolean;
  children?: ReactNode;
}

/**
 * Shared shell for every auth page: one centered white card on a light
 * slate page. Same look for every page, RTL by default.
 */
export default function AuthLayout({
  title,
  subtitle,
  context,
  loading,
  loadingLabel = t('common.loading'),
  terminalError,
  wide,
  children,
}: Props) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-4">
      <div
        className={cn(
          'w-full rounded-panel border border-line bg-surface p-6 shadow-card sm:p-8',
          wide ? 'max-w-lg' : 'max-w-[26rem]',
        )}
      >
        <Wordmark className="justify-center" />

        <h1 className="mt-6 text-center text-2xl font-black leading-snug">{title}</h1>
        {subtitle && <p className="mt-1.5 text-center text-sm text-ink-mute">{subtitle}</p>}

        {context && <div className="mt-5">{context}</div>}

        <div className="mt-6">
          {loading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-3 py-4 text-ink-soft"
            >
              <span className="spinner" aria-hidden />
              {loadingLabel}
            </div>
          ) : terminalError ? (
            <div className="space-y-5">
              <p role="alert" className="notice notice-error text-center">
                {terminalError.message}
              </p>
              <SubmitButton
                type="button"
                variant="secondary"
                label={terminalError.actionLabel}
                onClick={terminalError.onAction}
              />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
