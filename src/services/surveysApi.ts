import {
  FileListResponse,
  FileResponse,
  FileUrlResponse,
  Survey,
  SurveyArray,
  SurveyList,
  SurveyRequirement,
  type SurveyAnswersInput,
  type SurveyCancelBody,
  type SurveyCreateInput,
  type SurveyDecisionBody,
  type SurveyListQuery,
  type SurveyReassignBody,
  type SurveyRequirementQuery,
  type SurveySubmitInput,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';

/** What the surveys page asks for (the contract's query, every key optional). */
export type SurveyListParams = Partial<SurveyListQuery>;

export const surveyKeys = {
  all: (orgId: string | null) => ['surveys', orgId] as const,
  list: (orgId: string | null, params: SurveyListParams) =>
    ['surveys', orgId, 'list', params] as const,
  one: (orgId: string | null, id: string) => ['surveys', orgId, 'one', id] as const,
  photos: (orgId: string | null, id: string) => ['surveys', orgId, 'photos', id] as const,
  /** A customer's surveys live under the customer, so the customer page's invalidation covers it. */
  ofCustomer: (orgId: string | null, customerId: string) =>
    ['customers', orgId, 'surveys', customerId] as const,
};

/**
 * R05 field surveys (D75). The server decides everything (who may, the score, the status): nothing
 * here computes or trusts a rule. A collector (survey.submit only) gets only the surveys assigned
 * to them; anyone else allowed gets the shop's.
 */
export const surveysApi = {
  list: async (params: SurveyListParams = {}) =>
    SurveyList.parse((await api.get('/api/surveys', { params })).data),
  get: async (id: string) => Survey.parse((await api.get(`/api/surveys/${id}`)).data),
  ofCustomer: async (customerId: string) =>
    SurveyArray.parse((await api.get(`/api/customers/${customerId}/surveys`)).data),
  /** N02's POS screen asks this; the profile shows the same facts. */
  requirement: async (customerId: string, query: SurveyRequirementQuery) =>
    SurveyRequirement.parse(
      (await api.get(`/api/customers/${customerId}/survey-requirement`, { params: query })).data,
    ),

  /** survey.assign. One open survey per customer (SURVEY_ALREADY_OPEN with the open one). */
  assign: async (body: SurveyCreateInput) =>
    Survey.parse((await api.post('/api/surveys', body)).data),
  reassign: async (id: string, body: SurveyReassignBody) =>
    Survey.parse((await api.post(`/api/surveys/${id}/reassign`, body)).data),
  cancel: async (id: string, body: SurveyCancelBody) =>
    Survey.parse((await api.post(`/api/surveys/${id}/cancel`, body)).data),

  /** The assignee only (SURVEY_NOT_ASSIGNEE): merges the keys sent; `null` removes one. */
  save: async (id: string, body: SurveyAnswersInput) =>
    Survey.parse((await api.patch(`/api/surveys/${id}`, body)).data),
  /** Merges the body, then every answer, the GPS fix and one photo are required. */
  submit: async (id: string, body: SurveySubmitInput = {}) =>
    Survey.parse((await api.post(`/api/surveys/${id}/submit`, body)).data),
  /** survey.decide; the assignee can't decide their own survey, except the owner. */
  decide: async (id: string, body: SurveyDecisionBody) =>
    Survey.parse((await api.post(`/api/surveys/${id}/decide`, body)).data),

  /** The survey's photos (F14). Empty for a user without customer.view_pii. */
  photos: async (id: string) =>
    FileListResponse.parse(
      (await api.get('/api/files', { params: { entityType: 'field_survey', entityId: id } })).data,
    ).items.filter((f) => f.purpose === 'survey_photo'),
  /** F14 upload with purpose "survey_photo", linked to the survey (the assignee, status assigned). */
  uploadPhoto: async (id: string, file: File, onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    form.append('purpose', 'survey_photo');
    form.append('entityType', 'field_survey');
    form.append('entityId', id);
    form.append('file', file);
    // multipart: the default JSON content type would make axios serialize the form.
    const res = await api.post('/api/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...(onProgress
        ? { onUploadProgress: (e) => onProgress(e.total ? Math.min(1, e.loaded / e.total) : 0) }
        : {}),
    });
    return FileResponse.parse(res.data);
  },
  /** Short-lived signed link to open a photo (needs customer.view_pii). */
  photoUrl: async (fileId: string) =>
    FileUrlResponse.parse((await api.get(`/api/files/${fileId}/url`)).data),
};
