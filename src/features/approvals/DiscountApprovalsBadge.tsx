import { usePendingDiscountApprovals } from '@/features/approvals/useDiscountApprovals';
import { t } from '@/i18n';

/**
 * The count of waiting over-cap requests, drawn next to the menu item. The item itself is only in
 * the menu for someone with discount.above_cap, so this never asks the server for anyone else.
 */
export default function DiscountApprovalsBadge() {
  const pending = usePendingDiscountApprovals();
  const count = pending.data?.items.length ?? 0;
  if (count === 0) return null;
  return (
    <span
      className="ms-auto inline-flex min-w-6 items-center justify-center rounded-full bg-brand-600 px-2 text-xs font-medium text-white"
      aria-label={t('sales.approvals.badge', { count })}
    >
      {count}
    </span>
  );
}
