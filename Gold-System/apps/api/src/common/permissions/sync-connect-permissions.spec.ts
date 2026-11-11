import {
  CONNECT_PERMISSION_DEFINITIONS,
  syncConnectPermissionsAdditively,
} from './sync-connect-permissions';

describe('syncConnectPermissionsAdditively', () => {
  it('adds exactly the approved permissions to the two approved roles idempotently', async () => {
    const permissionIds = new Map<string, string>();
    const roleLinks = new Map<string, Set<string>>([
      ['manager-id', new Set(['manual.manager.permission'])],
      ['admin-id', new Set(['manual.admin.permission'])],
      ['customer-id', new Set(['customer.profile.read'])],
    ]);
    const client = {
      role: {
        findMany: jest.fn(async () => [
          { id: 'manager-id', name: 'store_manager' },
          { id: 'admin-id', name: 'platform_admin' },
        ]),
      },
      permission: {
        upsert: jest.fn(
          async ({ where, create }: { where: { key: string }; create: { key: string } }) => {
            if (!permissionIds.has(where.key))
              permissionIds.set(where.key, `permission-${where.key}`);
            return { id: permissionIds.get(where.key)!, key: create.key };
          },
        ),
        findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) =>
          where.key.in
            .filter((key) => permissionIds.has(key))
            .map((key) => ({ id: permissionIds.get(key)!, key })),
        ),
      },
      rolePermission: {
        createMany: jest.fn(
          async ({ data }: { data: Array<{ roleId: string; permissionId: string }> }) => {
            let count = 0;
            for (const link of data) {
              const links = roleLinks.get(link.roleId)!;
              const previousSize = links.size;
              links.add(link.permissionId);
              count += Number(links.size > previousSize);
            }
            return { count };
          },
        ),
        findMany: jest.fn(
          async ({
            where,
          }: {
            where: { roleId: { in: string[] }; permissionId: { in: string[] } };
          }) =>
            where.roleId.in.flatMap((roleId) =>
              [...(roleLinks.get(roleId) ?? new Set<string>())]
                .filter((permissionId) => where.permissionId.in.includes(permissionId))
                .map((permissionId) => ({ roleId, permissionId })),
            ),
        ),
      },
    };

    const first = await syncConnectPermissionsAdditively(client);
    const second = await syncConnectPermissionsAdditively(client);
    const expectedIds = CONNECT_PERMISSION_DEFINITIONS.map(({ key }) => `permission-${key}`).sort();

    expect(first.permissionKeys).toEqual(CONNECT_PERMISSION_DEFINITIONS.map(({ key }) => key));
    expect(first.assignmentsAdded).toBe(16);
    expect(second.assignmentsAdded).toBe(0);
    expect(second.roleNames).toEqual(first.roleNames);
    expect(second.permissionKeys).toEqual(first.permissionKeys);
    expect(
      [...roleLinks.get('manager-id')!].filter((id) => id.startsWith('permission-')).sort(),
    ).toEqual(expectedIds);
    expect(
      [...roleLinks.get('admin-id')!].filter((id) => id.startsWith('permission-')).sort(),
    ).toEqual(expectedIds);
    expect(roleLinks.get('manager-id')).toContain('manual.manager.permission');
    expect(roleLinks.get('admin-id')).toContain('manual.admin.permission');
    expect([...roleLinks.get('customer-id')!]).toEqual(['customer.profile.read']);
    expect(client.permission.upsert).toHaveBeenCalledTimes(16);
    expect(client.rolePermission.createMany).toHaveBeenCalledTimes(2);
  });

  it('fails before permission writes if an approved role is missing', async () => {
    const client = {
      role: {
        findMany: jest.fn().mockResolvedValue([{ id: 'manager-id', name: 'store_manager' }]),
      },
      permission: { upsert: jest.fn(), findMany: jest.fn() },
      rolePermission: { findMany: jest.fn(), createMany: jest.fn() },
    };

    await expect(syncConnectPermissionsAdditively(client)).rejects.toThrow('platform_admin');
    expect(client.permission.upsert).not.toHaveBeenCalled();
    expect(client.rolePermission.createMany).not.toHaveBeenCalled();
  });
});
