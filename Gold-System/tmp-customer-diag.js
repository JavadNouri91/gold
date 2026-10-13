const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const customers = await p.customer.count();
  const customersWithoutUserId = await p.customer.count({ where: { userId: null } });
  const users = await p.user.count();
  const userRows = await p.user.findMany({
    select: {
      customer: { select: { id: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  const byRole = {};
  for (const x of userRows) {
    const roles = x.roles.map((r) => r.role.name).join(',') || 'none';
    const key = `${roles}|customer=${Boolean(x.customer)}`;
    byRole[key] = (byRole[key] || 0) + 1;
  }
  console.log(JSON.stringify({ customers, customersWithoutUserId, users, byRole }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
