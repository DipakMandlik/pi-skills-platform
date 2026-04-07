export type Role = string;

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role; // primary role
  roles: Role[];
  primaryRole: Role;
  allowedModels: string[];
  allowedSkills: string[];
  enabledFeatures: string[];
  avatar?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  account?: string;
  email?: string;
  username: string;
  password: string;
  role?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: User;
}

export type Permission = string;
export type PermissionMap = Record<Permission, boolean>;
