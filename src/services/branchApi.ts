import {
  BranchList,
  ManagedBranchList,
  BranchDetail,
  BranchIdResponse,
  BranchActiveResponse,
  BranchDeactivationCheck,
  type BranchCreateBody,
  type BranchUpdateBody,
  type BranchDeactivateBody,
} from '@ziadkhaled-wb/contracts';
import { api } from '@/lib/api';
export const branchApi = {
  list: async () => BranchList.parse((await api.get('/api/branches')).data),
  manage: async () => ManagedBranchList.parse((await api.get('/api/branches/manage')).data),
  detail: async (id: string) => BranchDetail.parse((await api.get(`/api/branches/${id}`)).data),
  create: async (body: BranchCreateBody) =>
    BranchIdResponse.parse((await api.post('/api/branches', body)).data),
  update: async (id: string, body: BranchUpdateBody) =>
    BranchDetail.parse((await api.patch(`/api/branches/${id}`, body)).data),
  check: async (id: string) =>
    BranchDeactivationCheck.parse((await api.get(`/api/branches/${id}/deactivation-check`)).data),
  deactivate: async (id: string, body: BranchDeactivateBody) =>
    BranchActiveResponse.parse((await api.post(`/api/branches/${id}/deactivate`, body)).data),
  reactivate: async (id: string) =>
    BranchActiveResponse.parse((await api.post(`/api/branches/${id}/reactivate`)).data),
};
