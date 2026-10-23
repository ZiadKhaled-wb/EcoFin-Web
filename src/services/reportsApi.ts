import {
  ReceivablesQuery,
  ReceivablesReport,
  SalesReport,
  SalesReportQuery,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const reportKeys = {
  all: (orgId: string | null) => ['reports', orgId] as const,
  sales: (orgId: string | null, query: SalesReportQuery | null) =>
    ['reports', 'sales', orgId, query] as const,
  receivables: (orgId: string | null, query: ReceivablesQuery) =>
    ['reports', 'receivables', orgId, query] as const,
};

/**
 * D02 sales and margin report (D89) and D03 receivables aging (D90). Every number is a SQL aggregate
 * computed by the server and sent as a string; the browser formats them and never adds money up. Sales
 * cost, margin and contract profit are `null` without report.financial; the receivables aging needs it.
 */
export const reportsApi = {
  sales: async (query: SalesReportQuery) =>
    SalesReport.parse(
      (await api.get('/api/reports/sales', { params: SalesReportQuery.parse(query) })).data,
    ),
  receivables: async (query: ReceivablesQuery) =>
    ReceivablesReport.parse(
      (await api.get('/api/reports/receivables', { params: ReceivablesQuery.parse(query) })).data,
    ),
};
