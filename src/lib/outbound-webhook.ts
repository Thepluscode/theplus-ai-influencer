import 'server-only';

import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request, type RequestOptions } from 'node:https';

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
  // One deadline covers DNS, connect, and response: a stalled resolver or a
  // slow-drip server must not hold up the publish/review action awaiting us.
  const timeoutMs = input.timeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const { url, address } = await withDeadline(
    resolvePublicWebhookDestination(input.url),
    timeoutMs,
  );
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload(input.secret, timestamp, input.body);

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
        lookup: pinnedLookup(address),
      },
      (response) => {
        clearTimeout(timer);
        const status = response.statusCode ?? 0;
        response.destroy();
        resolve(status);
      },
    );

    const timer = setTimeout(
      () => req.destroy(new Error('Webhook delivery timed out.')),
      Math.max(1, deadline - Date.now()),
    );
    req.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end(input.body);
  });
}

// Connect to the address we already vetted instead of resolving again (DNS
// rebinding). Node's happy-eyeballs connect calls lookup with `all: true` and
// then expects an array; answering with a bare string fails every delivery.
export function pinnedLookup(address: ResolvedAddress): NonNullable<RequestOptions['lookup']> {
  type Callback = (
    error: NodeJS.ErrnoException | null,
    address: string | ResolvedAddress[],
    family?: number,
  ) => void;
  return ((_hostname: string, options: { all?: boolean }, callback: Callback) => {
    // Answer asynchronously like dns.lookup does: a synchronous answer lets an
    // immediate connect failure (EHOSTUNREACH) fire before the HTTPS socket is
    // wired up, which surfaced as an uncaught exception that killed the process.
    process.nextTick(() => {
      if (options?.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    });
  }) as NonNullable<RequestOptions['lookup']>;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Webhook delivery timed out.')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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
    if (numericAddress <= BigInt(1)) return false;
    // IPv4-mapped (::ffff:0:0/96) and well-known NAT64 (64:ff9b::/96, what
    // DNS64 hands IPv6-only hosts): judge the embedded IPv4 address.
    const prefix96 = numericAddress >> BigInt(32);
    if (prefix96 === BigInt('0xffff') || prefix96 === BigInt('0x64ff9b0000000000000000')) {
      const mapped = Number(numericAddress & BigInt('0xffffffff'));
      return isPublicIpAddress(
        `${mapped >>> 24}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`,
      );
    }
    // Allowlist, not denylist: only global unicast 2000::/3 is public. That
    // alone rejects ::/8 (incl. 100:: discard), other NAT64 prefixes, fc00::/7,
    // fe80::/10, fec0::/10 and ff00::/8. Then carve out the special ranges
    // inside 2000::/3 (IANA IPv6 special-purpose registry).
    return (
      numericAddress >> BigInt(125) === BigInt(1) &&
      numericAddress >> BigInt(105) !== BigInt(0x2001) << BigInt(7) && // 2001::/23 (Teredo, benchmarking, ORCHID)
      numericAddress >> BigInt(96) !== BigInt('0x20010db8') && // 2001:db8::/32 documentation
      numericAddress >> BigInt(112) !== BigInt(0x2002) && // 2002::/16 6to4 can embed private IPv4
      numericAddress >> BigInt(108) !== BigInt(0x3fff0) // 3fff::/20 documentation
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
