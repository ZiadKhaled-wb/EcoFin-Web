import { describe, it, expect, vi } from 'vitest';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { showSubscriptionError } from './subscriptionErrors';
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
describe('P05 global subscription toasts', () => {
  it.each(['PLAN_LIMIT_REACHED', 'SUBSCRIPTION_EXPIRED', 'MODULE_NOT_IN_PLAN'])(
    'toast for %s',
    (code) => {
      showSubscriptionError({ code, details: { resource: 'branches', limit: 1, used: 1 } });
      expect(toast.error).toHaveBeenLastCalledWith(
        code === 'PLAN_LIMIT_REACHED'
          ? t('subscriptions.limitReached', {
              limit: 1,
              resource: t('subscriptions.resources.branches'),
            })
          : t(
              code === 'SUBSCRIPTION_EXPIRED'
                ? 'subscriptions.expired'
                : 'subscriptions.moduleMissing',
            ),
      );
    },
  );
  it('does not show other errors', () => {
    vi.clearAllMocks();
    showSubscriptionError({ code: 'UNKNOWN' });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
