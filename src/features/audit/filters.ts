import type { AuditSearchParams } from '@/features/audit/auditApi';

export const AUDIT_PAGE_SIZE = 25;

/** The filters as they live in the URL (`/audit?action=auth.login&page=2`), so links and the
 * back button keep them. Dates are calendar days (YYYY-MM-DD) in the shop's local time. */
export interface AuditFilters {
  page: number;
  from: string;
  to: string;
  action: string;
  entityType: string;
  branchId: string;
  actorEmployeeId: string;
  /** Display only: the name shown on the person chip (the API filters by id). */
  actorName: string;
}

const KEYS = [
  'from',
  'to',
  'action',
  'entityType',
  'branchId',
  'actorEmployeeId',
  'actorName',
] as const;

export function readFilters(params: URLSearchParams): AuditFilters {
  const page = Number(params.get('page'));
  const filters = { page: Number.isInteger(page) && page > 0 ? page : 1 } as AuditFilters;
  for (const key of KEYS) filters[key] = params.get(key) ?? '';
  return filters;
}

/** Changing any filter goes back to page 1; empty values leave the URL. */
export function writeFilters(current: AuditFilters, patch: Partial<AuditFilters>): URLSearchParams {
  const next: AuditFilters = { ...current, ...patch, page: patch.page ?? 1 };
  const params = new URLSearchParams();
  if (next.page > 1) params.set('page', String(next.page));
  for (const key of KEYS) if (next[key]) params.set(key, next[key]);
  return params;
}

/** A calendar day's start / end as an ISO instant (the API filters on timestamps). */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

export function toSearchParams(f: AuditFilters): AuditSearchParams {
  return {
    page: f.page,
    pageSize: AUDIT_PAGE_SIZE,
    ...(f.from ? { from: dayStart(f.from) } : {}),
    ...(f.to ? { to: dayEnd(f.to) } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.actorEmployeeId ? { actorEmployeeId: f.actorEmployeeId } : {}),
  };
}

export const hasAnyFilter = (f: AuditFilters) => KEYS.some((k) => f[k] !== '');
