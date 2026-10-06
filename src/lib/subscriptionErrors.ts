import { PlanLimitDetail } from '@ziadkhaled-wb/contracts';
import { toast } from 'sonner';
import { t } from '@/i18n';
export function showSubscriptionError(error: { code: string; details?: unknown }) {
  if (error.code === 'PLAN_LIMIT_REACHED') {
    const detail = PlanLimitDetail.safeParse(error.details);
    toast.error(
      detail.success
        ? t('subscriptions.limitReached', {
            limit: detail.data.limit,
            resource: t(`subscriptions.resources.${detail.data.resource}`),
          })
        : t('subscriptions.validation'),
    );
  } else if (error.code === 'SUBSCRIPTION_EXPIRED') toast.error(t('subscriptions.expired'));
  else if (error.code === 'MODULE_NOT_IN_PLAN') toast.error(t('subscriptions.moduleMissing'));
}
