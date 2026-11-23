import 'server-only';

import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

type ResolvedAddress = { address: string; family: number };
type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const blockedHostnameSuffixes = [
  '.home.arpa',
  '.internal',
  '.invalid',
  '.local',
  '.localhost',
  '.test',
];

export function validateWebhookUrlSyntax(value: string): URL {
  const url = new URL(value);
  const hostname = normalizedHostname(url.hostname);

  if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS.');
  if (url.username || url.password) throw new Error('Webhook URL cannot contain credentials.');
  if (
    hostname === 'localhost' ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error('Webhook URL must use a public hostname.');
  }
  if (isIP(hostname) && !isPublicIpAddress(hostname)) {
    throw new Error('Webhook URL cannot target a private or reserved address.');
  }

  return url;
}

export async function resolvePublicWebhookDestination(
  value: string,
  resolver: Resolver = async (hostname) => lookup(hostname, { all: true, verbatim: true }),
): Promise<{ url: URL; address: ResolvedAddress }> {
  const url = validateWebhookUrlSyntax(value);
  const hostname = normalizedHostname(url.hostname);
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname);

  if (addresses.length === 0) throw new Error('Webhook hostname did not resolve.');
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Webhook hostname resolves to a private or reserved address.');
  }

  return { url, address: addresses[0] };
}

export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export async function postSignedWebhook(input: {
  url: string;
  secret: string;
  event: string;
  workspaceId: string;
  deliveryId: string;
  body: string;
  timeoutMs?: number;
}): Promise<number> {
  const { url, address } = await resolvePublicWebhookDestination(input.url);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload(input.secret, timestamp, input.body);
  const timeoutMs = input.timeoutMs ?? 5_000;

  return new Promise<number>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(input.body),
          'x-theplus-event': input.event,
          'x-theplus-workspace-id': input.workspaceId,
          'x-theplus-delivery-id': input.deliveryId,
          'x-theplus-timestamp': timestamp,
          'x-theplus-signature': signature,
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, address.address, address.family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        response.destroy();
        resolve(status);
      },
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error('Webhook delivery timed out.')));
    req.on('error', reject);
    req.end(input.body);
  });
}

export function isPublicIpAddress(value: string): boolean {
  const address = normalizedHostname(value).toLowerCase();
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (version === 6) {
    const numericAddress = ipv6ToBigInt(address);
    const top8 = numericAddress >> BigInt(120);
    const top10 = numericAddress >> BigInt(118);
    if (numericAddress <= BigInt(1)) return false;
    if (numericAddress >> BigInt(32) === BigInt('0xffff')) {
      const mapped = Number(numericAddress & BigInt('0xffffffff'));
      return isPublicIpAddress(
        `${mapped >>> 24}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`,
      );
    }
    return !(
      numericAddress >> BigInt(121) === BigInt('0x7e') ||
      top10 === BigInt('0x3fa') ||
      top10 === BigInt('0x3fb') ||
      top8 === BigInt('0xff') ||
      numericAddress >> BigInt(96) === BigInt('0x20010db8')
    );
  }
  return false;
}

function normalizedHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

function ipv6ToBigInt(address: string): bigint {
  let normalized = address;
  const ipv4Suffix = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Suffix) {
    const octets = ipv4Suffix.split('.').map(Number);
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${(
      (octets[2] << 8) |
      octets[3]
    ).toString(16)}`;
    normalized = normalized.slice(0, -ipv4Suffix.length) + replacement;
  }

  const [left = '', right = ''] = normalized.split('::');
  const leftGroups = left ? left.split(':') : [];
  const rightGroups = right ? right.split(':') : [];
  const groups = normalized.includes('::')
    ? [
        ...leftGroups,
        ...Array(8 - leftGroups.length - rightGroups.length).fill('0'),
        ...rightGroups,
      ]
    : leftGroups;

  return groups.reduce(
    (value, group) => (value << BigInt(16)) | BigInt(`0x${group || '0'}`),
    BigInt(0),
  );
}
