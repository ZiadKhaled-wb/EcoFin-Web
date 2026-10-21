import {
  ExportJob,
  ExportListResponse,
  FileUrlResponse,
  type StartExportBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const exportKeys = {
  all: (orgId: string | null) => ['exports', orgId] as const,
  list: (orgId: string | null) => ['exports', orgId, 'list'] as const,
};

/**
 * M03 full export (D86): one zip with every table of the shop as CSV and JSON. The server builds it
 * in a background job; this client starts it, watches the list and opens F14's signed link.
 */
export const exportsApi = {
  /** The same Idempotency-Key answers the same job, so a retry never starts a second export. */
  start: async (body: StartExportBody, idempotencyKey: string) =>
    ExportJob.parse(
      (await api.post('/api/exports', body, { headers: { 'Idempotency-Key': idempotencyKey } }))
        .data,
    ),
  list: async () => ExportListResponse.parse((await api.get('/api/exports')).data),
  cancel: async (id: string) => ExportJob.parse((await api.post(`/api/exports/${id}/cancel`)).data),
  /** A short-lived link to the zip (audited by the server as a download). */
  fileUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
