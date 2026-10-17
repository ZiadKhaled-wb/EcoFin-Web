import {
  OverdueAction,
  OverdueActionPage,
  OverdueListPage,
  OverdueRunResult,
  type DismissReferralBody,
  type HandleWarningBody,
  type LegalReferralListQueryInput,
  type OverdueListQueryInput,
  type OverdueWarningListQueryInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const overdueKeys = {
  all: (orgId: string | null) => ['overdue', orgId] as const,
  list: (orgId: string | null, query: OverdueListQueryInput) =>
    ['overdue', orgId, 'list', query] as const,
  warnings: (orgId: string | null, query: OverdueWarningListQueryInput) =>
    ['overdue', orgId, 'warnings', query] as const,
  referrals: (orgId: string | null, query: LegalReferralListQueryInput) =>
    ['overdue', orgId, 'referrals', query] as const,
};

/**
 * N04 overdue tracking (D79). The server runs the daily check and decides everything (grace days,
 * warnings, bans, legal referrals); the screen shows its lists. It never adds to what a customer
 * owes: no late fees (Islamic finance rule 4).
 */
export const overdueApi = {
  list: async (query: OverdueListQueryInput) =>
    OverdueListPage.parse((await api.get('/api/overdue', { params: query })).data),
  warnings: async (query: OverdueWarningListQueryInput) =>
    OverdueActionPage.parse((await api.get('/api/overdue/warnings', { params: query })).data),
  referrals: async (query: LegalReferralListQueryInput) =>
    OverdueActionPage.parse(
      (await api.get('/api/overdue/legal-referrals', { params: query })).data,
    ),
  handleWarning: async (id: string, body: HandleWarningBody) =>
    OverdueAction.parse((await api.post(`/api/overdue/warnings/${id}/handle`, body)).data),
  /** The owner only. */
  dismissReferral: async (id: string, body: DismissReferralBody) =>
    OverdueAction.parse((await api.post(`/api/overdue/legal-referrals/${id}/dismiss`, body)).data),
  /** The owner only: the nightly check, now. */
  run: async () => OverdueRunResult.parse((await api.post('/api/overdue/run')).data),
};
