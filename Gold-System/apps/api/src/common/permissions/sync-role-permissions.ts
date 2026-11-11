export interface RolePermissionSyncDelegate {
  findMany(args: {
    where: { roleId: string };
    select: { permissionId: true };
  }): Promise<Array<{ permissionId: string }>>;
  createMany(args: {
    data: Array<{ roleId: string; permissionId: string }>;
    skipDuplicates: true;
  }): Promise<{ count: number }>;
}

export interface RolePermissionSyncResult {
  desiredCount: number;
  existingDesiredCount: number;
  attemptedCount: number;
  insertedCount: number;
}

/** Adds missing baseline permissions without deleting manually assigned permissions. */
export async function syncRolePermissionsAdditively(
  delegate: RolePermissionSyncDelegate,
  roleId: string,
  desiredPermissionIds: string[],
): Promise<RolePermissionSyncResult> {
  const existing = await delegate.findMany({
    where: { roleId },
    select: { permissionId: true },
  });
  const existingIds = new Set(existing.map(({ permissionId }) => permissionId));
  const distinctDesiredIds = [...new Set(desiredPermissionIds)];
  const existingDesiredCount = distinctDesiredIds.filter((id) => existingIds.has(id)).length;
  const missingIds = distinctDesiredIds.filter((id) => !existingIds.has(id));
  if (missingIds.length === 0) {
    return {
      desiredCount: distinctDesiredIds.length,
      existingDesiredCount,
      attemptedCount: 0,
      insertedCount: 0,
    };
  }

  const result = await delegate.createMany({
    data: missingIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
  return {
    desiredCount: distinctDesiredIds.length,
    existingDesiredCount,
    attemptedCount: missingIds.length,
    insertedCount: result.count,
  };
}
