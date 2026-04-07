export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  WORKSPACE: '/workspace',
  SKILLS: '/skills',
  SKILL_DETAIL: '/skills/:skillId',
  MODELS: '/models',
  MONITORING: '/monitoring',
  UNAUTHORIZED: '/unauthorized',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
