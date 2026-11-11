INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES ('database-backup-storage-manage', 'database.backup.storage.manage', 'database', 'Configure the emergency backup S3 storage destination')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT roles."id", permissions."id"
FROM "roles" AS roles CROSS JOIN "permissions" AS permissions
WHERE roles."name" = 'platform_admin' AND permissions."key" = 'database.backup.storage.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
