import { afterEach, describe, expect, it, vi } from 'vitest';

import { authService } from './authService';

describe('apps/web authService token contract parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps canonical access_token response field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'canonical-access',
          user_id: 'u-1',
          display_name: 'Admin',
          role: 'ACCOUNTADMIN',
          primary_role: 'ACCOUNTADMIN',
          roles: ['ACCOUNTADMIN'],
        }),
      } as Response),
    );

    const result = await authService.login({
      account: 'acme-org',
      username: 'admin_user',
      password: 'secret',
      role: 'ACCOUNTADMIN',
    });

    expect(result.token).toBe('canonical-access');
    expect(result.user.id).toBe('u-1');
    expect(result.user.role).toBe('ORG_ADMIN');
    expect(result.user.roles).toContain('ACCOUNTADMIN');
  });

  it('maps legacy token response field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'legacy-access',
          user_id: 'u-2',
          display_name: 'Viewer',
          role: 'VIEWER',
          primary_role: 'VIEWER',
          roles: ['VIEWER'],
        }),
      } as Response),
    );

    const result = await authService.login({
      account: 'acme-org',
      username: 'viewer_user',
      password: 'secret',
    });

    expect(result.token).toBe('legacy-access');
    expect(result.user.id).toBe('u-2');
    expect(result.user.role).toBe('VIEWER');
    expect(result.user.roles).toContain('VIEWER');
  });

  it('maps refresh token fields when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'canonical-access',
          refresh_token: 'refresh-123',
          user_id: 'u-3',
          display_name: 'Engineer',
          role: 'DATA_ENGINEER',
          primary_role: 'DATA_ENGINEER',
          roles: ['DATA_ENGINEER'],
        }),
      } as Response),
    );

    const result = await authService.login({
      account: 'acme-org',
      username: 'engineer_user',
      password: 'secret',
    });

    expect(result.token).toBe('canonical-access');
    expect(result.refreshToken).toBe('refresh-123');
    expect(result.user.role).toBe('DATA_ENGINEER');
    expect(result.user.roles).toContain('DATA_ENGINEER');
  });
});
