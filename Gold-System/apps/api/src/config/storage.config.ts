import { join } from 'path';
import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  localRoot: process.env.STORAGE_LOCAL_ROOT ?? join(process.cwd(), '.data', 'uploads'),
  // Bucket names map to directories under localRoot and are immutable once
  // files have been stored, because they are embedded in existing DB keys.
  bucketDefault: process.env.STORAGE_BUCKET ?? 'gold-kyc',
  bucketKyc: process.env.STORAGE_BUCKET_KYC ?? 'gold-kyc-documents',
  bucketQuotations: process.env.STORAGE_BUCKET_QUOTATIONS ?? 'gold-quotations',
}));
