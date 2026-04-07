import { describe, expect, it } from 'vitest';
import { ROUTES } from './routes';

describe('route map', () => {
  it('contains all critical routes', () => {
    expect(ROUTES.LOGIN).toBe('/login');
    expect(ROUTES.DASHBOARD).toBe('/dashboard');
    expect(ROUTES.WORKSPACE).toBe('/workspace');
    expect(ROUTES.SKILLS).toBe('/skills');
    expect(ROUTES.MODELS).toBe('/models');
    expect(ROUTES.MONITORING).toBe('/monitoring');
    expect(ROUTES.GOVERNANCE).toBe('/governance');
    expect(ROUTES.UNAUTHORIZED).toBe('/unauthorized');
  });

  it('uses unique route values', () => {
    const values = Object.values(ROUTES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
