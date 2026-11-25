// @vitest-environment node
import { createServer, request } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

// A resolver that never answers, to prove the delivery deadline covers DNS.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(() => new Promise(() => {})) }));

import {
  isPublicIpAddress,
  pinnedLookup,
  postSignedWebhook,
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

  it.each([
    '100::1',
    '2001::1',
    '2001:2::1',
    '2001:db8::1',
    '2002:a00:1::1',
    '3fff::1',
    '64:ff9b::a00:1',
  ])('rejects special-purpose IPv6 %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it('judges a NAT64 address by the IPv4 address it embeds', () => {
    expect(isPublicIpAddress('64:ff9b::5db8:d822')).toBe(true); // 93.184.216.34
    expect(isPublicIpAddress('64:ff9b::a00:1')).toBe(false); // 10.0.0.1
    expect(isPublicIpAddress('64:ff9b::7f00:1')).toBe(false); // 127.0.0.1
  });

  it('turns an immediate connect failure into a request error, not a crash', async () => {
    // 100::1 is the discard prefix: unroutable, so connect fails at once.
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => {
      const req = httpsRequest('https://hooks.example.com/events', {
        method: 'POST',
        lookup: pinnedLookup({ address: '100::1', family: 6 }),
      });
      req.on('error', resolve);
      // Independent deadline: req.setTimeout only starts once a socket connects,
      // so a network that leaves the connect pending would hang the test.
      setTimeout(() => req.destroy(new Error('timeout')), 3_000).unref();
      req.end('{}');
    });
    expect(error.message).not.toMatch(/setServername/);
  });

  it.each(['2001:4860:4860::8888', '2a00:1450:4001::1', '2606:4700:4700::1111'])(
    'accepts global unicast IPv6 %s',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );

  it('connects a hostname request to the pinned address through Node itself', async () => {
    // Real Node connect path (happy-eyeballs calls lookup with all: true).
    const server = createServer((_req, res) => res.writeHead(204).end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          `http://hooks.example.com:${port}/events`,
          { method: 'POST', lookup: pinnedLookup({ address: '127.0.0.1', family: 4 }) },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.end('{}');
      });
      expect(status).toBe(204);
    } finally {
      server.close();
    }
  });

  it('times out a delivery whose DNS lookup never answers', async () => {
    const started = Date.now();
    await expect(
      postSignedWebhook({
        url: 'https://hooks.example.com/events',
        secret: 's',
        event: 'post.published',
        workspaceId: 'ws',
        deliveryId: 'd1',
        body: '{}',
        timeoutMs: 30,
      }),
    ).rejects.toThrow(/timed out/i);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('signs the timestamp and exact serialized payload', () => {
    expect(signWebhookPayload('secret', '1700000000', '{"ok":true}')).toBe(
      'sha256=c1afc7c2df3db0690d7d75954610ed1a1d959ce96355ccb8c0a8bc09fd0cfc27',
    );
  });
});
