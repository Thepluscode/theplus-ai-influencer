import 'server-only';
import { serverEnv } from '@/lib/env';

export function isCronAuthorized(header: string): boolean {
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return Boolean(token && serverEnv.CRON_SECRET && token === serverEnv.CRON_SECRET);
}
