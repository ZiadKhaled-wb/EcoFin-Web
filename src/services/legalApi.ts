import {
  FileListResponse,
  FileResponse,
  FileUrlResponse,
  LawyerListResponse,
  LegalCaseDetail,
  LegalCaseListResponse,
  type AddCaseNoteBody,
  type AddHearingBody,
  type LegalCaseListQueryInput,
  type OpenLegalCaseBody,
  type SetLegalCaseStatusBody,
  type UpdateHearingBody,
  type UpdateLegalCaseBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

export const legalKeys = {
  all: (orgId: string | null) => ['legal', orgId] as const,
  list: (orgId: string | null, query: LegalCaseListQueryInput) =>
    ['legal', orgId, 'list', query] as const,
  detail: (orgId: string | null, id: string) => ['legal', orgId, 'case', id] as const,
  lawyers: (orgId: string | null) => ['legal', orgId, 'lawyers'] as const,
  files: (orgId: string | null, id: string) => ['legal', orgId, 'files', id] as const,
};

const idempotent = (key: string) => ({ headers: { 'Idempotency-Key': key } });

/**
 * L01 + N09 (D92). The legal module. The server decides everything (who may see a case, the status
 * chain, the claim limit, the customer block); the screens show its answers. Every write answers
 * with the whole case, so the screen replaces it in its cache. A case never changes what a customer
 * owes: there is no fee or cost anywhere (Islamic finance rule 4).
 */
export const legalApi = {
  list: async (query: LegalCaseListQueryInput) =>
    LegalCaseListResponse.parse((await api.get('/api/legal/cases', { params: query })).data),
  get: async (id: string) => LegalCaseDetail.parse((await api.get(`/api/legal/cases/${id}`)).data),
  /** The owner only. `key` is made once per dialog: a second click is the same case, not a new one. */
  open: async (body: OpenLegalCaseBody, key: string) =>
    LegalCaseDetail.parse((await api.post('/api/legal/cases', body, idempotent(key))).data),
  update: async (id: string, body: UpdateLegalCaseBody) =>
    LegalCaseDetail.parse((await api.patch(`/api/legal/cases/${id}`, body)).data),
  setStatus: async (id: string, body: SetLegalCaseStatusBody) =>
    LegalCaseDetail.parse((await api.post(`/api/legal/cases/${id}/status`, body)).data),
  addHearing: async (id: string, body: AddHearingBody) =>
    LegalCaseDetail.parse((await api.post(`/api/legal/cases/${id}/hearings`, body)).data),
  updateHearing: async (id: string, hearingId: string, body: UpdateHearingBody) =>
    LegalCaseDetail.parse(
      (await api.patch(`/api/legal/cases/${id}/hearings/${hearingId}`, body)).data,
    ),
  addNote: async (id: string, body: AddCaseNoteBody) =>
    LegalCaseDetail.parse((await api.post(`/api/legal/cases/${id}/notes`, body)).data),
  /** The owner only: the shop's active lawyers. */
  lawyers: async () => LawyerListResponse.parse((await api.get('/api/legal/lawyers')).data),
  /** F14: the papers of a case (purpose legal_document). */
  files: async (id: string) =>
    FileListResponse.parse(
      (await api.get('/api/files', { params: { entityType: 'legal_case', entityId: id } })).data,
    ),
  uploadDocument: async (id: string, file: File) => {
    const form = new FormData();
    form.append('purpose', 'legal_document');
    form.append('entityType', 'legal_case');
    form.append('entityId', id);
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return FileResponse.parse(res.data);
  },
  /** A short-lived signed link to open one paper. */
  documentUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
