import { ApiClientError } from '@/lib/api';

const PERSIAN = /[\u0600-\u06FF]/;

/** Shows authored Persian API messages. Hides raw English/internal errors. */
export function friendlyApiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError && PERSIAN.test(err.message) && err.message.length < 280) {
    return err.message;
  }
  return fallback;
}
