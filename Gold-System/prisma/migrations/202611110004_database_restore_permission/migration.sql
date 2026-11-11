INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES ('database-backup-restore', 'database.backup.restore', 'database', 'Restore the database from a trusted emergency backup')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM "roles" AS roles
CROSS JOIN "permissions" AS permissions
WHERE roles."name" = 'platform_admin'
  AND permissions."key" = 'database.backup.restore'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
