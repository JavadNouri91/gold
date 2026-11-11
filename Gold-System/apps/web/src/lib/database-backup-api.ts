import { fetchBlob, request } from './api';

export interface DatabaseRestoreResult {
  restored: boolean;
  recoveryFileName: string;
  message: string;
}

export function restoreDatabase(file: File, confirmation: string) {
  const body = new FormData();
  body.append('file', file);
  body.append('confirmation', confirmation);
  return request<DatabaseRestoreResult>('/admin/database-backup/restore', { method: 'POST', body });
}

export interface BackupStorageSettings {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  allowHttp: boolean;
  configured: boolean;
  hasCredentials: boolean;
}
export type BackupStorageInput = Omit<BackupStorageSettings, 'configured' | 'hasCredentials'> & {
  accessKeyId?: string;
  secretAccessKey?: string;
};
export interface StoredBackup {
  key: string;
  size: number;
  lastModified: string | null;
}
export const backupStorageApi = {
  settings: () => request<BackupStorageSettings>('/admin/database-backup/storage/settings'),
  save: (body: BackupStorageInput) =>
    request<BackupStorageSettings>('/admin/database-backup/storage/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  test: () =>
    request<{ message: string }>('/admin/database-backup/storage/test', { method: 'POST' }),
  upload: () =>
    request<{ key: string; size: number; sha256: string; bucket: string }>(
      '/admin/database-backup/storage/backups',
      { method: 'POST' },
    ),
  list: (cursor?: string) =>
    request<{ items: StoredBackup[]; nextCursor: string | null }>(
      `/admin/database-backup/storage/objects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  download: (key: string) =>
    fetchBlob(`/admin/database-backup/storage/download?key=${encodeURIComponent(key)}`),
};
