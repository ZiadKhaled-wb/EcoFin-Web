import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FiscalDetails, FiscalListQuery } from '@ziadkhaled-wb/contracts';
import { fiscalApi, fiscalKeys } from '@/services/fiscalApi';
import { useAuthStore } from '@/store/authStore';

/** The alert badge and the cards look this often. */
export const FISCAL_SUMMARY_REFRESH_MS = 60_000;
/** An open receipt is looked at this often while a correction is queued. */
export const FISCAL_DETAILS_REFRESH_MS = 3_000;

/** The alert counts. Only asked for by someone with fiscal.view (`enabled`). */
export function useFiscalSummary(enabled = true) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: fiscalKeys.summary(orgId),
    queryFn: () => fiscalApi.summary(),
    enabled,
    refetchInterval: FISCAL_SUMMARY_REFRESH_MS,
  });
}

export function useFiscalList(query: FiscalListQuery) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: fiscalKeys.list(orgId, query),
    queryFn: () => fiscalApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/** The correction is looked for at most this long after "Correct and resend". */
export const WATCH_LIMIT_MS = 30_000;
/** Before the correction shows as queued, the screen still waits this long for it. */
export const WATCH_GRACE_MS = 4_000;

/**
 * True while a correction asked for at `watchStart` (ms) is still on its way: the receipt is still
 * rejected, and it shows as queued (or the grace period has not passed), within the time limit.
 * `at` is when the receipt was last read.
 */
export function isWatching(data: FiscalDetails | undefined, watchStart: number | null, at: number) {
  if (watchStart === null || data === undefined || data.situation !== 'rejected') return false;
  const elapsed = at - watchStart;
  return elapsed < WATCH_LIMIT_MS && (data.diagnosis.correction_queued || elapsed < WATCH_GRACE_MS);
}

/** One receipt; read again every few seconds while a correction asked for at `watchStart` is on its way. */
export function useFiscalDetails(id: string | null, watchStart: number | null) {
  const orgId = useAuthStore((s) => s.orgId);
  return useQuery({
    queryKey: fiscalKeys.one(orgId, id ?? ''),
    queryFn: () => fiscalApi.get(id!),
    enabled: id !== null,
    refetchInterval: (query) =>
      isWatching(query.state.data, watchStart, query.state.dataUpdatedAt)
        ? FISCAL_DETAILS_REFRESH_MS
        : false,
  });
}

/** Every action refreshes the list, the cards and the receipt. */
export function useFiscalAction<V, R>(run: (v: V) => Promise<R>) {
  const cache = useQueryClient();
  const orgId = useAuthStore((s) => s.orgId);
  return useMutation({
    mutationFn: run,
    onSettled: () => cache.invalidateQueries({ queryKey: fiscalKeys.all(orgId) }),
  });
}
