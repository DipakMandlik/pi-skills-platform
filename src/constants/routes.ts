export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  WORKSPACE: '/workspace',
  SKILLS: '/skills',
  SKILL_DETAIL: '/skills/:skillId',
  SKILL_STUDIO: '/skills/:skillId/edit',
  SKILL_STUDIO_NEW: '/skills/new',
  MODELS: '/models',
  MONITORING: '/monitoring',
  GOVERNANCE: '/governance',
  USERS: '/users',
  TEAMS: '/teams',
  ANALYTICS: '/analytics',
  SETTINGS: '/settings',
  UNAUTHORIZED: '/unauthorized',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
