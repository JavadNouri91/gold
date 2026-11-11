import { syncRolePermissionsAdditively } from './sync-role-permissions';

describe('syncRolePermissionsAdditively', () => {
  it('can seed repeatedly without duplicates and preserves manual permissions', async () => {
    const links = new Set(['manual.permission']);
    const delegate = {
      findMany: jest.fn(async ({ where }: { where: { roleId: string } }) => {
        expect(where.roleId).toBe('customer');
        return [...links].map((permissionId) => ({ permissionId }));
      }),
      createMany: jest.fn(
        async ({ data }: { data: Array<{ roleId: string; permissionId: string }> }) => {
          let count = 0;
          for (const link of data) {
            const before = links.size;
            links.add(link.permissionId);
            count += Number(links.size > before);
          }
          return { count };
        },
      ),
    };

    await syncRolePermissionsAdditively(delegate, 'customer', [
      'customer.profile.read',
      'customer.order.read_own',
      'customer.profile.read',
    ]);
    await syncRolePermissionsAdditively(delegate, 'customer', [
      'customer.profile.read',
      'customer.order.read_own',
    ]);

    expect([...links].sort()).toEqual(
      ['manual.permission', 'customer.profile.read', 'customer.order.read_own'].sort(),
    );
    expect(delegate.createMany).toHaveBeenCalledTimes(1);
    expect(delegate.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'customer', permissionId: 'customer.profile.read' },
        { roleId: 'customer', permissionId: 'customer.order.read_own' },
      ],
      skipDuplicates: true,
    });
  });
});
