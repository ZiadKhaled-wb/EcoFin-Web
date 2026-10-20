import {
  FileResponse,
  FileUrlResponse,
  ImportInspection,
  ImportJob,
  ImportListResponse,
  type CreateImportBody,
  type ImportKind,
  type ImportListQueryInput,
  type InspectImportBody,
  type RunImportBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const importKeys = {
  all: (orgId: string | null) => ['imports', orgId] as const,
  /** Every history page (not the single jobs that are being polled). */
  lists: (orgId: string | null) => ['imports', orgId, 'list'] as const,
  list: (orgId: string | null, query: ImportListQueryInput) =>
    ['imports', orgId, 'list', query] as const,
  one: (orgId: string | null, id: string) => ['imports', orgId, 'one', id] as const,
};

/** M01 import (import.data): templates, the file check, the dry run, the run and the history. */
export const importsApi = {
  /** The empty file of a kind as a Blob (the Web saves it). */
  template: async (kind: ImportKind, format: 'xlsx' | 'csv') =>
    (
      await api.get<Blob>(`/api/imports/templates/${kind}`, {
        params: { format },
        responseType: 'blob',
      })
    ).data,
  /** F14 upload with purpose "import"; the returned id goes into inspect / create. */
  upload: async (file: File) => {
    const form = new FormData();
    form.append('purpose', 'import');
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
  inspect: async (body: InspectImportBody) =>
    ImportInspection.parse((await api.post('/api/imports/inspect', body)).data),
  /** The dry run. The key is kept per file + sheet + mapping, so a retried click is the same job. */
  create: async (body: CreateImportBody) =>
    ImportJob.parse((await api.post('/api/imports', body)).data),
  list: async (query: ImportListQueryInput = {}) =>
    ImportListResponse.parse((await api.get('/api/imports', { params: query })).data),
  get: async (id: string) => ImportJob.parse((await api.get(`/api/imports/${id}`)).data),
  run: async (id: string, body: RunImportBody) =>
    ImportJob.parse((await api.post(`/api/imports/${id}/run`, body)).data),
  cancel: async (id: string) => ImportJob.parse((await api.post(`/api/imports/${id}/cancel`)).data),
  /** Short-lived signed link to a file (the errors CSV). */
  fileUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
