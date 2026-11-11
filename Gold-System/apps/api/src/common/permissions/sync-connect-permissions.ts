export const CONNECT_PERMISSION_DEFINITIONS = [
  {
    key: 'connect.settings.read',
    module: 'integrations',
    description: 'مشاهده تنظیمات و وضعیت اتصال Connect',
  },
  {
    key: 'connect.settings.manage',
    module: 'integrations',
    description: 'مدیریت تنظیمات و اطلاعات اتصال Connect',
  },
  {
    key: 'connect.connection.test',
    module: 'integrations',
    description: 'آزمایش ارتباط HTTP با Connect',
  },
  {
    key: 'connect.status.read',
    module: 'integrations',
    description: 'مشاهده وضعیت ارتباط با Connect',
  },
  {
    key: 'connect.products.read',
    module: 'integrations',
    description: 'مشاهده کاتالوگ محصولات Connect',
  },
  {
    key: 'connect.products.sync',
    module: 'integrations',
    description: 'همگام‌سازی دستی کاتالوگ Connect',
  },
  {
    key: 'connect.products.mapping.manage',
    module: 'integrations',
    description: 'مدیریت نگاشت محصولات Connect',
  },
  {
    key: 'connect.products.mapping.verify',
    module: 'integrations',
    description: 'تأیید نگاشت محصولات Connect',
  },
] as const;

export const CONNECT_PERMISSION_ROLE_NAMES = ['store_manager', 'platform_admin'] as const;

interface ConnectPermissionSyncClient {
  role: {
    findMany(args: {
      where: { name: { in: string[] } };
      select: { id: true; name: true };
    }): Promise<Array<{ id: string; name: string }>>;
  };
  permission: {
    upsert(args: {
      where: { key: string };
      create: { key: string; module: string; description: string };
      update: Record<string, never>;
    }): Promise<{ id: string; key: string }>;
    findMany(args: {
      where: { key: { in: string[] } };
      select: { id: true; key: true };
    }): Promise<Array<{ id: string; key: string }>>;
  };
  rolePermission: {
    createMany(args: {
      data: Array<{ roleId: string; permissionId: string }>;
      skipDuplicates: true;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: { roleId: { in: string[] }; permissionId: { in: string[] } };
      select: { roleId: true; permissionId: true };
    }): Promise<Array<{ roleId: string; permissionId: string }>>;
  };
}

/** Ensures only Connect permissions for the two approved management roles. */
export async function syncConnectPermissionsAdditively(
  client: ConnectPermissionSyncClient,
): Promise<{
  roleNames: string[];
  permissionKeys: string[];
  assignmentsAdded: number;
  desiredAssignments: number;
  existingAssignments: number;
  attemptedAssignments: number;
}> {
  const roleNames = [...CONNECT_PERMISSION_ROLE_NAMES];
  const roles = await client.role.findMany({
    where: { name: { in: roleNames } },
    select: { id: true, name: true },
  });
  const foundRoleNames = new Set(roles.map(({ name }) => name));
  const missingRoleNames = roleNames.filter((name) => !foundRoleNames.has(name));
  if (missingRoleNames.length) {
    throw new Error(`Required system role(s) are missing: ${missingRoleNames.join(', ')}`);
  }

  await Promise.all(
    CONNECT_PERMISSION_DEFINITIONS.map((definition) =>
      client.permission.upsert({
        where: { key: definition.key },
        create: { ...definition },
        // Preserve any existing metadata if a Connect permission was customized.
        update: {},
      }),
    ),
  );
  const permissions = await client.permission.findMany({
    where: { key: { in: CONNECT_PERMISSION_DEFINITIONS.map(({ key }) => key) } },
    select: { id: true, key: true },
  });
  if (permissions.length !== CONNECT_PERMISSION_DEFINITIONS.length) {
    throw new Error('Connect permission upsert did not produce the complete permission set.');
  }
  const permissionIds = permissions.map(({ id }) => id);
  const assignments = roles.flatMap((role) =>
    permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
  );
  const syncResult = await client.rolePermission.createMany({
    data: assignments,
    skipDuplicates: true,
  });
  const verifiedAssignments = await client.rolePermission.findMany({
    where: {
      roleId: { in: roles.map(({ id }) => id) },
      permissionId: { in: permissionIds },
    },
    select: { roleId: true, permissionId: true },
  });
  if (verifiedAssignments.length !== assignments.length) {
    throw new Error('Connect permission assignment verification failed.');
  }

  return {
    roleNames,
    permissionKeys: CONNECT_PERMISSION_DEFINITIONS.map(({ key }) => key),
    assignmentsAdded: syncResult.count,
    desiredAssignments: assignments.length,
    existingAssignments: verifiedAssignments.length - syncResult.count,
    attemptedAssignments: assignments.length,
  };
}
