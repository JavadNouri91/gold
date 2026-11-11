INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES (
  'database-backup-create',
  'database.backup.create',
  'database',
  'Download an emergency database backup'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM "roles" AS roles
CROSS JOIN "permissions" AS permissions
WHERE roles."name" IN ('store_manager', 'platform_admin')
  AND permissions."key" = 'database.backup.create'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
