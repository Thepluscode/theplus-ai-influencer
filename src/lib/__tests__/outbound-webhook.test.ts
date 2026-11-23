import { describe, expect, it } from 'vitest';
import {
  isPublicIpAddress,
  resolvePublicWebhookDestination,
  signWebhookPayload,
  validateWebhookUrlSyntax,
} from '@/lib/outbound-webhook';

describe('outbound webhook security', () => {
  it.each([
    'https://localhost/hook',
    'https://api.internal/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.4/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/hook',
  ])('rejects local or reserved destination %s', (url) => {
    expect(() => validateWebhookUrlSyntax(url)).toThrow(/public|private|reserved/i);
  });

  it('rejects a public hostname when any DNS answer is private', async () => {
    await expect(
      resolvePublicWebhookDestination('https://hooks.example.com/events', async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.8', family: 4 },
      ]),
    ).rejects.toThrow(/private or reserved/i);
  });

  it('pins an allowed public DNS answer for delivery', async () => {
    await expect(
      resolvePublicWebhookDestination('https://hooks.example.com/events', async () => [
        { address: '93.184.216.34', family: 4 },
      ]),
    ).resolves.toMatchObject({
      address: { address: '93.184.216.34', family: 4 },
    });
  });

  it('classifies private, mapped, and public addresses', () => {
    expect(isPublicIpAddress('192.168.1.2')).toBe(false);
    expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('::ffff:7f00:1')).toBe(false);
    expect(isPublicIpAddress('0:0:0:0:0:0:0:1')).toBe(false);
    expect(isPublicIpAddress('fec0::1')).toBe(false);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIpAddress('1.1.1.1')).toBe(true);
  });

  it('signs the timestamp and exact serialized payload', () => {
    expect(signWebhookPayload('secret', '1700000000', '{"ok":true}')).toBe(
      'sha256=c1afc7c2df3db0690d7d75954610ed1a1d959ce96355ccb8c0a8bc09fd0cfc27',
    );
  });
});
