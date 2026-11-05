/* Read-only identity audit. Run with DATABASE_URL set before deploying the auth migration. */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
function normalize(value) {
  return value
    .trim()
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[\s()-]/g, '')
    .replace(/^(?:\+98|0098|98)(9\d{9})$/, '0$1');
}
async function main() {
  // Raw selects also work before the mobile_verified_at migration exists.
  const users = await db.$queryRaw`SELECT id, mobile FROM users`;
  const customers = await db.$queryRaw`SELECT id, user_id AS "userId", mobile FROM customers`;
  const issues = [];
  for (const [table, rows] of [
    ['users', users],
    ['customers', customers],
  ]) {
    const groups = new Map();
    for (const row of rows) {
      const value = normalize(row.mobile);
      if (!/^09\d{9}$/.test(value)) issues.push({ table, id: row.id, issue: 'invalid mobile' });
      groups.set(value, [...(groups.get(value) || []), row.id]);
    }
    for (const ids of groups.values())
      if (ids.length > 1) issues.push({ table, ids, issue: 'normalization collision' });
  }
  const mobiles = new Map(users.map((row) => [row.id, normalize(row.mobile)]));
  for (const row of customers)
    if (row.userId && mobiles.get(row.userId) !== normalize(row.mobile)) {
      issues.push({ table: 'customers', id: row.id, issue: 'linked mobile mismatch' });
    }
  console.log(JSON.stringify({ valid: issues.length === 0, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
}
main()
  .catch(() => {
    console.error('Preflight failed; check database access.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
