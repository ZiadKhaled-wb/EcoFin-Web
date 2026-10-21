import {
  FileResponse,
  MigrationBatchReversal,
  MigrationReport,
  MigrationSignOff,
  MigrationSignOffList,
  type MigrationSignOffBody,
  type ReverseMigrationBatchBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export interface MigrationFilters {
  batch_id?: string;
  branch_id?: string;
  customer_id?: string;
}

export const migrationKeys = {
  all: (orgId: string | null) => ['migration', orgId] as const,
  report: (orgId: string | null, filters: MigrationFilters) =>
    ['migration', orgId, 'report', filters] as const,
  signOffs: (orgId: string | null) => ['migration', orgId, 'sign-offs'] as const,
};

/**
 * M02 opening balances (D85): the reconciliation report, the sign-off against the old records and
 * the undo of a wrong batch. Every number comes from the server; this client never adds money up.
 */
export const migrationApi = {
  report: async (filters: MigrationFilters = {}) =>
    MigrationReport.parse((await api.get('/api/migration/report', { params: filters })).data),
  /** The same report as the CSV the owner prints and signs. */
  reportCsv: async (filters: MigrationFilters = {}) =>
    (
      await api.get<Blob>('/api/migration/report', {
        params: { ...filters, format: 'csv' },
        responseType: 'blob',
      })
    ).data,
  signOffs: async () =>
    MigrationSignOffList.parse((await api.get('/api/migration/sign-offs')).data),
  signOff: async (body: MigrationSignOffBody) =>
    MigrationSignOff.parse((await api.post('/api/migration/sign-offs', body)).data),
  reverse: async (id: string, body: ReverseMigrationBatchBody) =>
    MigrationBatchReversal.parse(
      (await api.post(`/api/migration/batches/${id}/reverse`, body)).data,
    ),
  /** F14 upload with purpose "other": the scan of the signed paper. */
  uploadScan: async (file: File) => {
    const form = new FormData();
    form.append('purpose', 'other');
    form.append('file', file);
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
};
