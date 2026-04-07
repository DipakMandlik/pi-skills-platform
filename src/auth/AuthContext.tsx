import { createContext } from 'react';
import type { User, LoginCredentials } from './types';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  role: string | null;
  roles: string[];
  enabledFeatures: string[];
  allowedModels: string[];
  allowedSkills: string[];
  hasRole: (role: string) => boolean;
  hasFeature: (feature: string) => boolean;
  hasModelAccess: (modelId: string) => boolean;
  hasSkillAccess: (skillId: string) => boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
