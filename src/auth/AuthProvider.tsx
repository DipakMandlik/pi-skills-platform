import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthContext } from './AuthContext';
import { authService } from './authService';
import type { User, LoginCredentials } from './types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        authService.logout();
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authService.login(credentials);
      localStorage.setItem('auth_token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('refresh_token', response.refreshToken);
      }
      localStorage.setItem('sf_account', credentials.account || '');
      localStorage.setItem('sf_username', credentials.username);
      setUser(response.user);
      setToken(response.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setToken(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const hasRole = useCallback((role: string) => {
    if (!user) return false;
    const upper = role.toUpperCase();
    // Check both the roles array (all Snowflake grants) and the primary role field.
    return (user.roles ?? []).some(r => r.toUpperCase() === upper)
      || (user.role ?? '').toUpperCase() === upper;
  }, [user]);

  const hasFeature = useCallback((feature: string) => {
    if (!user) return false;
    // When backend returns no feature list, features are unrestricted.
    if (!user.enabledFeatures?.length) return true;
    return user.enabledFeatures.includes(feature);
  }, [user]);

  const hasModelAccess = useCallback((modelId: string) => {
    if (!user) return false;
    // Empty list = no backend restrictions yet; grant access.
    if (!user.allowedModels?.length) return true;
    return user.allowedModels.includes(modelId);
  }, [user]);

  const hasSkillAccess = useCallback((skillId: string) => {
    if (!user) return false;
    // Empty list = no backend restrictions yet; grant access.
    if (!user.allowedSkills?.length) return true;
    return user.allowedSkills.includes(skillId);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading,
      error,
      role: user?.primaryRole ?? null,
      roles: user?.roles ?? [],
      enabledFeatures: user?.enabledFeatures ?? [],
      allowedModels: user?.allowedModels ?? [],
      allowedSkills: user?.allowedSkills ?? [],
      hasRole,
      hasFeature,
      hasModelAccess,
      hasSkillAccess,
      login,
      logout,
      clearError,
    }),
    [
      user,
      token,
      isLoading,
      error,
      hasRole,
      hasFeature,
      hasModelAccess,
      hasSkillAccess,
      login,
      logout,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
