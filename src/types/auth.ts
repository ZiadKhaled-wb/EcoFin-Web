export type Role =
  | "OWNER"
  | "OPS_MANAGER"
  | "ACCOUNTANT"
  | "CASHIER"
  | "COLLECTOR"
  | "WAREHOUSE_MANAGER"
  | "HR_MANAGER"
  | "LAWYER"
  | "EMPLOYEE"
  | "SUPER_ADMIN"; // platform users only; not a tenant role (ADR-0004 D6)

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "المالك",
  OPS_MANAGER: "مدير العمليات",
  ACCOUNTANT: "محاسب",
  CASHIER: "كاشير",
  COLLECTOR: "محصّل",
  WAREHOUSE_MANAGER: "أمين المخزن",
  HR_MANAGER: "مدير الموارد البشرية",
  LAWYER: "محامي",
  EMPLOYEE: "موظف",
  SUPER_ADMIN: "مدير المنصة",
};

export interface AuthUser {
  id: string;
  personId: string;
  email: string | null;
  username: string | null;
  role: Role;
  branchId: string | null;
  orgId: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
  must_change_password: boolean;
}

export interface Session {
  access_token: string;
  refresh_token: string;
}

export interface LoginResponse {
  user: AuthUser;
  session: Session;
  must_change_password: boolean;
}

export interface CheckLicenseResponse {
  is_used: boolean;
  plan_key: string;
  org_name: string;
}

export interface ActivateWorkspaceResponse {
  tenant_slug: string;
  tenant_name: string;
  org_id: string;
}
