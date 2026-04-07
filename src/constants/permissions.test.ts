import { describe, expect, it } from 'vitest';
import { getPermissions } from './permissions';

describe('permissions mapping', () => {
  it('grants elevated permissions for ORG_ADMIN', () => {
    const admin = getPermissions('ORG_ADMIN');
    expect(admin.viewDashboard).toBe(true);
    expect(admin.viewAllSkills).toBe(true);
    expect(admin.viewAllModels).toBe(true);
    expect(admin.manageModels).toBe(true);
    expect(admin.manageUsers).toBe(true);
  });

  it('restricts sensitive permissions for BUSINESS_USER', () => {
    const user = getPermissions('BUSINESS_USER');
    expect(user.viewDashboard).toBe(true);
    expect(user.viewWorkspace).toBe(true);
    expect(user.viewAllSkills).toBe(false);
    expect(user.viewAllModels).toBe(false);
    expect(user.manageModels).toBe(false);
    expect(user.manageUsers).toBe(false);
  });
});
