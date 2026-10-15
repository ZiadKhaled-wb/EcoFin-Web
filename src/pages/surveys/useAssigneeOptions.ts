import { useQuery } from '@tanstack/react-query';
import { ROLE_DEFAULT_PERMISSIONS, type EmployeeRole } from '@ziadkhaled-wb/contracts';
import type { SelectOption } from '@/components/ui/Select';
import { useCan } from '@/features/me/useCan';
import { useMe } from '@/features/me/useMe';
import { staffApi } from '@/services/staffApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

/** Roles whose default permissions include filling surveys (OWNER, BRANCH_MANAGER, COLLECTOR). */
const SURVEY_ROLES = (Object.keys(ROLE_DEFAULT_PERMISSIONS) as EmployeeRole[]).filter((role) =>
  ROLE_DEFAULT_PERMISSIONS[role].includes('survey.submit'),
);

/**
 * Who a survey can go to (employees with overrides included, see below). The employee list needs
 * employee.manage; without it the only choice is
 * the signed-in employee (when they may fill surveys). The server checks the assignee again
 * (active, same shop, survey.submit after overrides): SURVEY_ASSIGNEE_INVALID otherwise.
 */
export function useAssigneeOptions(enabled: boolean) {
  const orgId = useAuthStore((s) => s.orgId);
  const canList = useCan('employee.manage');
  const canSubmit = useCan('survey.submit');
  const me = useMe();
  const staff = useQuery({
    queryKey: ['employees', orgId, 'survey-assignees'] as const,
    queryFn: () => staffApi.list({ status: 'active', page_size: 100 }),
    enabled: enabled && canList,
  });

  const self = me.data?.employee;
  const options: SelectOption[] = [];
  if (canList) {
    // The list has no effective permissions, only the role and how many overrides an employee
    // has. Roles whose defaults include survey.submit come first; an employee of another role
    // with overrides may have been given it, so they are offered too, marked. The server has the
    // last word either way (an override can also take the key away).
    const extra: SelectOption[] = [];
    for (const e of staff.data?.items ?? []) {
      if (!e.is_active) continue;
      const label = e.id === self?.id ? t('surveys.assign.me', { name: e.full_name }) : e.full_name;
      if (SURVEY_ROLES.includes(e.role)) options.push({ value: e.id, label });
      else if (e.override_count > 0) {
        extra.push({ value: e.id, label: t('surveys.assign.byOverride', { name: label }) });
      }
    }
    options.push(...extra);
  }
  if (self && canSubmit && !options.some((o) => o.value === self.id)) {
    options.unshift({ value: self.id, label: t('surveys.assign.me', { name: self.fullName }) });
  }
  return {
    options,
    /** No employee list for this user: only "me" can be offered. */
    selfOnly: !canList,
    loading: canList && staff.isPending,
    failed: canList && staff.isError,
  };
}
