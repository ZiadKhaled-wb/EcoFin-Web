import { SalesReport, SalesReportQuery } from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const reportKeys = {
  all: (orgId: string | null) => ['reports', orgId] as const,
  sales: (orgId: string | null, query: SalesReportQuery | null) =>
    ['reports', 'sales', orgId, query] as const,
};

/**
 * D02 sales and margin report (D89). Every number is a SQL aggregate computed by the server and sent
 * as a string; the browser formats them and never adds money up. Cost, margin and contract profit are
 * `null` without report.financial.
 */
export const reportsApi = {
  sales: async (query: SalesReportQuery) =>
    SalesReport.parse(
      (await api.get('/api/reports/sales', { params: SalesReportQuery.parse(query) })).data,
    ),
};
