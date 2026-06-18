/**
 * GhostStack DNS-over-TLS (DoT) Client
 * Performs encrypted DNS queries via TLS on port 853 (RFC 7858).
 * Complements DoH — if HTTPS-based DNS is blocked, DoT over raw TLS may still work.
 * @module DoTClient
 */

import * as tls from 'tls'

export interface DoTResolvedRecord {
  ip: string
  ttl: number
  provider: string
}

/** Known DoT provider endpoints (IP:port) */
export const DOT_PROVIDERS = {
  cloudflare: { host: '1.1.1.1', port: 853, name: 'cloudflare' },
  google: { host: '8.8.8.8', port: 853, name: 'google' },
  quad9: { host: '9.9.9.9', port: 853, name: 'quad9' },
  adguard: { host: '94.140.14.14', port: 853, name: 'adguard' },
  mullvad: { host: '194.242.2.2', port: 853, name: 'mullvad' }
} as const

export type DoTProvider = keyof typeof DOT_PROVIDERS

/**
 * Encode a domain name into DNS wire format.
 * "example.com" → [7, e, x, a, m, p, l, e, 3, c, o, m, 0]
 */
function encodeDomainName(domain: string): Buffer {
  const labels = domain.split('.')
  const parts: Buffer[] = []
  for (const label of labels) {
    const len = Buffer.alloc(1)
    len.writeUInt8(label.length, 0)
    parts.push(len)
    parts.push(Buffer.from(label, 'ascii'))
  }
  parts.push(Buffer.alloc(1, 0)) // Root label
  return Buffer.concat(parts)
}

/**
 * Build a DNS query packet for an A or AAAA record.
 * @param domain - Domain to query
 * @param recordType - 1 for A (IPv4), 28 for AAAA (IPv6)
 * @returns DNS query as a Buffer
 */
function buildDNSQuery(domain: string, recordType: number = 1): Buffer {
  const id = Buffer.alloc(2)
  id.writeUInt16BE(Math.floor(Math.random() * 0xffff), 0)

  const flags = Buffer.alloc(2)
  flags.writeUInt16BE(0x0100, 0) // Standard query, recursion desired

  const counts = Buffer.alloc(8)
  counts.writeUInt16BE(1, 0) // QDCOUNT = 1
  counts.writeUInt16BE(0, 2) // ANCOUNT = 0
  counts.writeUInt16BE(0, 4) // NSCOUNT = 0
  counts.writeUInt16BE(0, 6) // ARCOUNT = 0

  const qname = encodeDomainName(domain)
  const qtype = Buffer.alloc(2)
  qtype.writeUInt16BE(recordType, 0) // A = 1, AAAA = 28

  const qclass = Buffer.alloc(2)
  qclass.writeUInt16BE(1, 0) // IN (Internet)

  const dnsPacket = Buffer.concat([id, flags, counts, qname, qtype, qclass])

  // DoT requires a 2-byte length prefix (TCP DNS framing)
  const lengthPrefix = Buffer.alloc(2)
  lengthPrefix.writeUInt16BE(dnsPacket.length, 0)

  return Buffer.concat([lengthPrefix, dnsPacket])
}

/**
 * Parse A records from a DNS response packet.
 * @param data - Raw DNS response (without the 2-byte TCP length prefix)
 * @param provider - Provider name for tagging
 * @returns Parsed A records
 */
function parseARecords(data: Buffer, provider: string): DoTResolvedRecord[] {
  const results: DoTResolvedRecord[] = []

  if (data.length < 12) return results

  const ancount = data.readUInt16BE(6)
  let offset = 12

  // Skip question section
  while (offset < data.length && data[offset] !== 0) {
    if ((data[offset] & 0xc0) === 0xc0) {
      offset += 2
      break
    }
    offset += data[offset] + 1
  }
  if (offset < data.length && data[offset] === 0) offset++
  offset += 4 // Skip QTYPE and QCLASS

  // Parse answer section
  for (let i = 0; i < ancount && offset < data.length; i++) {
    // Skip name (may be compressed)
    if ((data[offset] & 0xc0) === 0xc0) {
      offset += 2
    } else {
      while (offset < data.length && data[offset] !== 0) {
        offset += data[offset] + 1
      }
      offset++ // Skip null terminator
    }

    if (offset + 10 > data.length) break

    const rtype = data.readUInt16BE(offset)
    offset += 2
    // const rclass = data.readUInt16BE(offset)
    offset += 2
    const ttl = data.readUInt32BE(offset)
    offset += 4
    const rdlength = data.readUInt16BE(offset)
    offset += 2

    if (rtype === 1 && rdlength === 4 && offset + 4 <= data.length) {
      // A record — IPv4
      const ip = `${data[offset]}.${data[offset + 1]}.${data[offset + 2]}.${data[offset + 3]}`
      results.push({ ip, ttl, provider })
    } else if (rtype === 28 && rdlength === 16 && offset + 16 <= data.length) {
      // AAAA record — IPv6
      const parts: string[] = []
      for (let j = 0; j < 16; j += 2) {
        parts.push(data.readUInt16BE(offset + j).toString(16))
      }
      const ip = parts.join(':')
      results.push({ ip, ttl, provider })
    }

    offset += rdlength
  }

  return results
}

/**
 * Perform a DNS-over-TLS query.
 * Connects to the provider on port 853 via TLS, sends a DNS query,
 * and parses the response.
 * @param domain - Domain to resolve
 * @param provider - DoT provider to use
 * @param recordType - 1 for A, 28 for AAAA
 * @param timeout - Timeout in milliseconds
 * @returns Array of resolved records
 */
export async function queryDoT(
  domain: string,
  provider: DoTProvider = 'cloudflare',
  recordType: number = 1,
  timeout: number = 5000
): Promise<DoTResolvedRecord[]> {
  const providerInfo = DOT_PROVIDERS[provider]

  return new Promise((resolve) => {
    const results: DoTResolvedRecord[] = []
    let resolved = false

    const done = (res: DoTResolvedRecord[]) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      try {
        socket.destroy()
      } catch {}
      resolve(res)
    }

    const timer = setTimeout(() => done(results), timeout)

    const socket = tls.connect(
      {
        host: providerInfo.host,
        port: providerInfo.port,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false // Some networks MITM even port 853
      },
      () => {
        const query = buildDNSQuery(domain, recordType)
        socket.write(query)
      }
    )

    let responseBuffer = Buffer.alloc(0)

    socket.on('data', (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk])

      // DoT responses have a 2-byte length prefix
      if (responseBuffer.length >= 2) {
        const expectedLen = responseBuffer.readUInt16BE(0)
        if (responseBuffer.length >= expectedLen + 2) {
          const dnsResponse = responseBuffer.subarray(2, expectedLen + 2)
          const records = parseARecords(dnsResponse, providerInfo.name)
          done(records)
        }
      }
    })

    socket.on('error', () => done(results))
    socket.on('timeout', () => done(results))
  })
}

/**
 * Multi-provider DoT consensus query.
 * Queries 3 providers via DoT and returns the IP with majority agreement.
 * @param domain - Domain to resolve
 * @param recordType - 1 for A, 28 for AAAA
 * @returns Consensus result or null
 */
export async function consensusDoT(
  domain: string,
  recordType: number = 1
): Promise<{ ip: string; provider: string } | null> {
  const providers: DoTProvider[] = ['cloudflare', 'google', 'quad9']

  const results = await Promise.all(providers.map((p) => queryDoT(domain, p, recordType, 5000)))

  const ipVotes: Map<string, string[]> = new Map()
  for (let i = 0; i < results.length; i++) {
    if (results[i].length > 0) {
      const ip = results[i][0].ip
      const existing = ipVotes.get(ip) || []
      existing.push(providers[i])
      ipVotes.set(ip, existing)
    }
  }

  for (const [ip, voters] of ipVotes) {
    if (voters.length >= 2) {
      return { ip, provider: `dot_consensus(${voters.join(',')})` }
    }
  }

  if (results[0].length > 0) {
    return { ip: results[0][0].ip, provider: 'dot_cloudflare_fallback' }
  }

  return null
}
