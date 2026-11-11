import { PrismaClient } from '@prisma/client';
import { syncConnectPermissionsAdditively } from '../../apps/api/src/common/permissions/sync-connect-permissions';

const APPROVED_DATABASE = 'gold_db';
const APPROVED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const APPROVED_PORT = '5433';

async function main() {
  assertApprovedClientTarget(process.env.DATABASE_URL);
  const prisma = new PrismaClient();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [identity] = await tx.$queryRaw<
        Array<{ database_name: string; schema_name: string }>
      >`SELECT current_database() AS database_name, current_schema() AS schema_name`;
      if (identity?.database_name !== APPROVED_DATABASE || identity.schema_name !== 'public') {
        throw new Error(
          'Connected database identity did not match the approved development target.',
        );
      }
      const result = await syncConnectPermissionsAdditively(tx);
      const roleRows = await tx.role.findMany({
        where: { name: { in: result.roleNames } },
        select: { id: true },
      });
      const permissionRows = await tx.permission.findMany({
        where: { key: { in: result.permissionKeys } },
        select: { id: true },
      });
      const assignments = await tx.rolePermission.findMany({
        where: {
          roleId: { in: roleRows.map(({ id }) => id) },
          permissionId: { in: permissionRows.map(({ id }) => id) },
        },
        select: { roleId: true, permissionId: true },
      });
      const expectedAssignments = result.roleNames.length * result.permissionKeys.length;
      if (
        roleRows.length !== result.roleNames.length ||
        permissionRows.length !== result.permissionKeys.length ||
        assignments.length !== expectedAssignments
      ) {
        throw new Error(
          `CONNECT_PERMISSION_SYNC_VERIFY:roles=${roleRows.length};permissions=${permissionRows.length};assignments=${assignments.length};expected=${expectedAssignments};desired=${result.desiredAssignments};existing=${result.existingAssignments};attempted=${result.attemptedAssignments};added=${result.assignmentsAdded}`,
        );
      }
      return result;
    });

    console.log(
      `Connect permissions synchronized for ${result.roleNames.join(', ')} (${result.permissionKeys.length} permissions; ${result.assignmentsAdded} new role assignments).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function assertApprovedClientTarget(databaseUrl?: string) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is invalid.');
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !APPROVED_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port !== APPROVED_PORT ||
    databaseName !== APPROVED_DATABASE
  ) {
    throw new Error('Database target did not match the approved local development database.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const diagnostic = message.match(
    /^CONNECT_PERMISSION_SYNC_VERIFY:roles=\d+;permissions=\d+;assignments=\d+;expected=\d+;desired=\d+;existing=\d+;attempted=\d+;added=\d+$/,
  );
  console.error(
    diagnostic?.[0] ?? 'Connect permission synchronization failed; details are suppressed.',
  );
  process.exitCode = 1;
});
