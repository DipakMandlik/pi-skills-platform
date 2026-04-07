import type { Role, PermissionMap } from '../auth/types';

export function getPermissions(role: Role): PermissionMap {
  switch (role) {
    case 'ORG_ADMIN':
      return {
        viewDashboard: true,
        viewAllSkills: true,
        createSkill: true,
        assignSkill: true,
        revokeSkill: true,
        viewAllModels: true,
        manageModels: true,
        viewAllMonitoring: true,
        viewOwnMonitoring: true,
        manageUsers: true,
        viewWorkspace: true,
      };
    case 'SECURITY_ADMIN':
      return {
        viewDashboard: true,
        viewAllSkills: true,
        createSkill: false,
        assignSkill: false,
        revokeSkill: false,
        viewAllModels: true,
        manageModels: true,
        viewAllMonitoring: true,
        viewOwnMonitoring: true,
        manageUsers: true,
        viewWorkspace: true,
      };
    case 'DATA_ENGINEER':
    case 'ANALYTICS_ENGINEER':
    case 'DATA_SCIENTIST':
      return {
        viewDashboard: true,
        viewAllSkills: true,
        createSkill: false,
        assignSkill: false,
        revokeSkill: false,
        viewAllModels: true,
        manageModels: false,
        viewAllMonitoring: false,
        viewOwnMonitoring: true,
        manageUsers: false,
        viewWorkspace: true,
      };
    case 'BUSINESS_USER':
    case 'VIEWER':
      return {
        viewDashboard: true,
        viewAllSkills: false,
        createSkill: false,
        assignSkill: false,
        revokeSkill: false,
        viewAllModels: false,
        manageModels: false,
        viewAllMonitoring: false,
        viewOwnMonitoring: true,
        manageUsers: false,
        viewWorkspace: true,
      };
  }
}
