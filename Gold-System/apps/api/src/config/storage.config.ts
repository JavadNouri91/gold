import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT,
  accessKey: process.env.STORAGE_ACCESS_KEY,
  secretKey: process.env.STORAGE_SECRET_KEY,
  bucketKyc: process.env.STORAGE_BUCKET_KYC ?? 'gold-kyc-documents',
  bucketQuotations: process.env.STORAGE_BUCKET_QUOTATIONS ?? 'gold-quotations',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
}));
