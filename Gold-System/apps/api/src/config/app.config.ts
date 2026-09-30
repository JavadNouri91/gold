import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.APP_PORT ?? '4001', 10),
  name: process.env.APP_NAME ?? 'Gold System API',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4000',
}));
