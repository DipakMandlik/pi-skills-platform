import { createContext } from 'react';
import type { User, LoginCredentials, PermissionMap, Role } from './types';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  role: Role | null;
  permissions: PermissionMap;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
