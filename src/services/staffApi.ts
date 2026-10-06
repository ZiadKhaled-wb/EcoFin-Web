import {
  EmployeesResponse,
  EmployeeCreateResponse,
  EmployeeUpdateResponse,
  EmployeeActiveResponse,
  EmployeeInviteResponse,
  EmployeeResetResponse,
  PasswordResetLookupResponse,
  PasswordResetCompleteResponse,
  EmployeePermissionOverrideResponse,
  EmployeeBranchesAssignResponse,
  type EmployeeCreateBody,
  type EmployeeUpdateBody,
  type EmployeeActiveBody,
  type EmployeesQuery,
  type EmployeePermissionOverrideBody,
  type EmployeeBranchesAssignBody,
  type PasswordResetCompleteBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const staffApi = {
  list: async (q: Partial<EmployeesQuery> = {}) =>
    EmployeesResponse.parse((await api.get('/api/employees', { params: q })).data),
  create: async (body: EmployeeCreateBody) =>
    EmployeeCreateResponse.parse((await api.post('/api/employees', body)).data),
  update: async (id: string, body: EmployeeUpdateBody) =>
    EmployeeUpdateResponse.parse((await api.patch(`/api/employees/${id}`, body)).data),
  active: async (id: string, body: EmployeeActiveBody) =>
    EmployeeActiveResponse.parse((await api.put(`/api/employees/${id}/active`, body)).data),
  invite: async (id: string) =>
    EmployeeInviteResponse.parse((await api.post(`/api/employees/${id}/invite`)).data),
  reset: async (id: string) =>
    EmployeeResetResponse.parse((await api.post(`/api/employees/${id}/password-reset`)).data),
  permission: async (id: string, body: EmployeePermissionOverrideBody) =>
    EmployeePermissionOverrideResponse.parse(
      (await api.put(`/api/employees/${id}/permissions`, body)).data,
    ),
  branches: async (id: string, body: EmployeeBranchesAssignBody) =>
    EmployeeBranchesAssignResponse.parse(
      (await api.put(`/api/employees/${id}/branches`, body)).data,
    ),
};
export const passwordResetApi = {
  lookup: async (token: string) =>
    PasswordResetLookupResponse.parse(
      (await api.post('/api/auth/password-reset/lookup', { token }, { skipAuth: true })).data,
    ),
  complete: async (body: PasswordResetCompleteBody) =>
    PasswordResetCompleteResponse.parse(
      (await api.post('/api/auth/password-reset/complete', body, { skipAuth: true })).data,
    ),
};
