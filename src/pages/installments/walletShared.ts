import { ROLE_DEFAULT_PERMISSIONS, type EmployeeRole } from '@ziadkhaled-wb/contracts';
import { useQuery } from '@tanstack/react-query';
import type { SelectOption } from '@/components/ui/Select';
import { useCan } from '@/features/me/useCan';
import { useMe } from '@/features/me/useMe';
import { ApiError } from '@/lib/api';
import { staffApi } from '@/services/staffApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';

/** What each wallet / collector error code says (the server's codes, N06). */
export const WALLET_ERRORS: Record<string, TranslationKey> = {
  CUSTOMER_NOT_ASSIGNED: 'wallets.errors.CUSTOMER_NOT_ASSIGNED',
  COLLECTOR_INVALID: 'wallets.errors.COLLECTOR_INVALID',
  WALLET_BALANCE_CHANGED: 'wallets.errors.WALLET_BALANCE_CHANGED',
  SELF_SETTLEMENT: 'wallets.errors.SELF_SETTLEMENT',
  WALLET_NOT_FOUND: 'wallets.errors.WALLET_NOT_FOUND',
  INSUFFICIENT_FUNDS: 'wallets.errors.INSUFFICIENT_FUNDS',
  CASH_ACCOUNT_NOT_FOUND: 'wallets.errors.CASH_ACCOUNT_NOT_FOUND',
  PERMISSION_DENIED: 'wallets.errors.PERMISSION_DENIED',
};

export function walletError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : '';
  return t(WALLET_ERRORS[code] ?? 'wallets.errors.failed');
}

/** Roles whose default permissions include taking collections (OWNER, BRANCH_MANAGER, CASHIER, COLLECTOR). */
const COLLECTOR_ROLES = (Object.keys(ROLE_DEFAULT_PERMISSIONS) as EmployeeRole[]).filter((role) =>
  ROLE_DEFAULT_PERMISSIONS[role].includes('collection.create'),
);

/**
 * Who a customer can be assigned to. The employee list needs employee.manage; without it the only
 * choice is the signed-in employee (when they take collections). The server checks the collector
 * again (active, same shop, collection.create after overrides): COLLECTOR_INVALID otherwise.
 */
export function useCollectorOptions(enabled: boolean) {
  const orgId = useAuthStore((s) => s.orgId);
  const canList = useCan('employee.manage');
  const canCollect = useCan('collection.create');
  const me = useMe();
  const staff = useQuery({
    queryKey: ['employees', orgId, 'collector-options'] as const,
    queryFn: () => staffApi.list({ status: 'active', page_size: 100 }),
    enabled: enabled && canList,
  });
  const self = me.data?.employee;
  const options: SelectOption[] = [];
  if (canList) {
    const extra: SelectOption[] = [];
    for (const e of staff.data?.items ?? []) {
      if (!e.is_active) continue;
      const label =
        e.id === self?.id ? t('wallets.collector.me', { name: e.full_name }) : e.full_name;
      if (COLLECTOR_ROLES.includes(e.role)) options.push({ value: e.id, label });
      else if (e.override_count > 0) {
        extra.push({ value: e.id, label: t('wallets.collector.byOverride', { name: label }) });
      }
    }
    options.push(...extra);
  }
  if (self && canCollect && !options.some((o) => o.value === self.id)) {
    options.unshift({ value: self.id, label: t('wallets.collector.me', { name: self.fullName }) });
  }
  return {
    options,
    selfOnly: !canList,
    loading: canList && staff.isPending,
    failed: canList && staff.isError,
  };
}
