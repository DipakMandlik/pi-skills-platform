import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthContext } from './AuthContext';
import { authService } from './authService';
import { getPermissions } from '../constants/permissions';
import type { User, LoginCredentials, PermissionMap } from './types';
import { skillsApi } from '../api/apiClient';
import { useStore } from '../store';

const EMPTY_PERMISSIONS: PermissionMap = {
  viewDashboard: false,
  viewAllSkills: false,
  createSkill: false,
  assignSkill: false,
  revokeSkill: false,
  viewAllModels: false,
  manageModels: false,
  viewAllMonitoring: false,
  viewOwnMonitoring: false,
  manageUsers: false,
  viewWorkspace: false,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skillsHydratedRef = useRef(false);
  const skillsHydrationAttemptsRef = useRef(0);

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem('auth_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const restoredUser = await authService.me();
        setUser(restoredUser);
        setToken(storedToken);
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const hydrateSkills = async () => {
      if (!token) return;
      if (skillsHydratedRef.current) return;

      const iconByType: Record<string, string> = {
        ai: 'Brain',
        sql: 'Code2',
        hybrid: 'Zap',
        system: 'Settings',
      };

      try {
        const res = await skillsApi.list(token, { page: 1, page_size: 200 });
        const apiSkills = res.skills.map((s) => ({
          id: s.skill_id,
          name: s.display_name,
          description: s.description || '',
          iconName: iconByType[s.skill_type] || 'Sparkles',
        }));

        const current = useStore.getState().skills;
        const custom = current.filter((s) => s.isCustom || s.id.startsWith('custom-'));
        const seen = new Set(apiSkills.map((s) => s.id));
        const merged = [...apiSkills, ...custom.filter((s) => !seen.has(s.id))];

        useStore.getState().setSkills(merged);
        skillsHydratedRef.current = true;
        skillsHydrationAttemptsRef.current = 0;
      } catch {
        // Non-fatal: workspace can fall back to local skill list.
        skillsHydrationAttemptsRef.current += 1;
        if (skillsHydrationAttemptsRef.current <= 5) {
          window.setTimeout(() => {
            // allow a retry if backend was still starting
            if (token) hydrateSkills();
          }, 2000);
        }
      }
    };

    hydrateSkills();
  }, [token]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authService.login(credentials);
      localStorage.setItem('auth_token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('refresh_token', response.refreshToken);
      }
      setUser(response.user);
      setToken(response.token);
      skillsHydratedRef.current = false;
      skillsHydrationAttemptsRef.current = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setToken(null);
    setError(null);
    skillsHydratedRef.current = false;
    skillsHydrationAttemptsRef.current = 0;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const permissions = useMemo<PermissionMap>(
    () => (user ? getPermissions(user.role) : EMPTY_PERMISSIONS),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading,
      error,
      role: user?.role ?? null,
      permissions,
      login,
      logout,
      clearError,
    }),
    [user, token, isLoading, error, permissions, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
