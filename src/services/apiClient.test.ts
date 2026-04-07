import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from './apiClient';

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('apiClient 401 behavior', () => {
  const originalFetch = global.fetch;
  let storage: ReturnType<typeof makeLocalStorage>;

  beforeEach(() => {
    storage = makeLocalStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('does not clear auth token on 401', async () => {
    storage.setItem('auth_token', 'token-123');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Unauthorized' }),
      } as Response),
    );

    await expect(apiClient('/admin/model-access')).rejects.toBeInstanceOf(ApiError);
    expect(storage.getItem('auth_token')).toBe('token-123');
  });

  it('returns normalized session-expired message on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'RBAC denied' }),
      } as Response),
    );

    await expect(apiClient('/admin/model-access')).rejects.toMatchObject({
      message: 'Session expired. Please sign in again.',
      status: 401,
    });
  });
});
