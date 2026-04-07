export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const PERMISSIONS = {
  MANAGE_BILLING: ["OWNER"],
  INVITE_MEMBERS: ["OWNER", "ADMIN"],
  MANAGE_WORKSPACE_SETTINGS: ["OWNER", "ADMIN"],
  CREATE_INVOICE: ["OWNER", "ADMIN", "MEMBER"],
  EDIT_INVOICE: ["OWNER", "ADMIN", "MEMBER"],
  DELETE_INVOICE: ["OWNER", "ADMIN"],
  CREATE_EXPENSE: ["OWNER", "ADMIN", "MEMBER"],
  EDIT_EXPENSE: ["OWNER", "ADMIN", "MEMBER"],
  DELETE_EXPENSE: ["OWNER", "ADMIN"],
  VIEW_FINANCES: ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
  MANAGE_CLIENTS: ["OWNER", "ADMIN", "MEMBER"],
};

export function hasPermission(userRole: string, permission: keyof typeof PERMISSIONS) {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(userRole as Role);
}

export function canManageBilling(role: string) {
  return hasPermission(role, "MANAGE_BILLING");
}

export function canInviteMembers(role: string) {
  return hasPermission(role, "INVITE_MEMBERS");
}

export function canCreateInvoice(role: string) {
  return hasPermission(role, "CREATE_INVOICE");
}

export function canEditFinances(role: string) {
  return ["OWNER", "ADMIN", "MEMBER"].includes(role);
}

// Limits based on plan tier
export const PLAN_LIMITS = {
  FREE: { maxUsers: 1 },
  PRO: { maxUsers: 1 },
  TEAM: { maxUsers: 5 },
};

export function getMaxUsersForPlan(planTier: string) {
  switch (planTier.toUpperCase()) {
    case "TEAM":
      return PLAN_LIMITS.TEAM.maxUsers;
    case "PRO":
      return PLAN_LIMITS.PRO.maxUsers;
    case "FREE":
    default:
      return PLAN_LIMITS.FREE.maxUsers;
  }
}
