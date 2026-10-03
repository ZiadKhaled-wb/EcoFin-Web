import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { AlertIcon } from '@/components/ui/Icons';
import { t } from '@/i18n';

/** Catches render errors below it so one broken page never blanks the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logs only. The user sees a translated message, never the technical text.
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        role="alert"
        tone="danger"
        icon={<AlertIcon width={24} height={24} />}
        title={t('shell.errorBoundary.title')}
        description={t('shell.errorBoundary.description')}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {t('shell.errorBoundary.reload')}
          </Button>
        }
      />
    );
  }
}
