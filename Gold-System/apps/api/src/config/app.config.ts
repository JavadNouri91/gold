import { registerAs } from '@nestjs/config';

export function parseCorsOrigins(value: string | undefined): string[] {
  const list = (value ?? 'http://localhost:4000,http://127.0.0.1:4000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ['http://localhost:4000'];
}

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.APP_PORT ?? '4001', 10),
  name: process.env.APP_NAME ?? 'Gold System API',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
}));
