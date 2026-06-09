import { Reader } from '@maxmind/geoip2-node'
import fs from 'fs'
import path from 'path'
import { app, net } from 'electron'

export interface GeoResult {
  ip: string
  region: string
  country: string
  countryCode: string
  city: string
  isp: string
  asn: string
  cdn: string
}

// Maps known CDN/cloud ASNs to friendly names
const CDN_ASN_MAP: Record<string, string> = {
  'AS13335': 'Cloudflare',
  'AS209242': 'Cloudflare',
  'AS16509': 'Amazon CloudFront',
  'AS14618': 'Amazon CloudFront',
  'AS20940': 'Akamai',
  'AS16625': 'Akamai',
  'AS54113': 'Fastly',
  'AS15169': 'Google CDN',
  'AS396982': 'Google Cloud',
  'AS8075':  'Microsoft Azure CDN',
  'AS8068':  'Microsoft Azure CDN',
  'AS60068': 'CDN77',
  'AS46489': 'Twitch/Amazon',
  'AS32934': 'Meta/Facebook',
  'AS63293': 'Meta/Facebook',
  'AS2906':  'Netflix',
  'AS55095': 'StackPath CDN',
}

function asnToCdn(asField: string): string {
  const match = asField.match(/^(AS\d+)/)
  if (!match) return ''
  return CDN_ASN_MAP[match[1]] || ''
}

const EMPTY: GeoResult = { ip: '', region: 'Unknown', country: 'Unknown', countryCode: '', city: 'Unknown', isp: 'Unknown', asn: '', cdn: '' }

export class IpGeolocationService {
  private cityReader: Reader | null = null
  private asnReader: Reader | null = null
  private hasLocalDb = false
  private remoteCache = new Map<string, GeoResult>()

  constructor() {
    this.init()
  }

  private init() {
    try {
      const dataPath = path.join(app.getPath('userData'), 'databases')
      const cityDbPath = path.join(dataPath, 'GeoLite2-City.mmdb')
      const asnDbPath  = path.join(dataPath, 'GeoLite2-ASN.mmdb')

      if (fs.existsSync(cityDbPath)) this.cityReader = Reader.openBuffer(fs.readFileSync(cityDbPath))
      if (fs.existsSync(asnDbPath))  this.asnReader  = Reader.openBuffer(fs.readFileSync(asnDbPath))

      this.hasLocalDb = !!(this.cityReader || this.asnReader)
      if (!this.hasLocalDb) {
        console.info('[IpGeolocationService] No local GeoLite2 databases — using ip-api.com fallback.')
      }
    } catch (e) {
      console.error('[IpGeolocationService] Init failed:', e)
    }
  }

  // Synchronous local-only lookup (used when MaxMind DBs are present)
  public lookupIp(ipAddress: string): GeoResult {
    const result: GeoResult = { ...EMPTY, ip: ipAddress }
    if (!ipAddress) return result

    try {
      if (this.cityReader) {
        // @ts-ignore
        const r = this.cityReader.city(ipAddress)
        result.region      = r.subdivisions?.[0]?.names?.en || 'Unknown'
        result.country     = r.country?.names?.en || 'Unknown'
        result.countryCode = r.country?.isoCode || ''
        result.city        = r.city?.names?.en || 'Unknown'
      }
      if (this.asnReader) {
        // @ts-ignore
        const r = this.asnReader.asn(ipAddress)
        const asnStr   = r.autonomousSystemNumber ? `AS${r.autonomousSystemNumber}` : ''
        result.isp     = r.autonomousSystemOrganization || 'Unknown'
        result.asn     = asnStr
        result.cdn     = asnToCdn(asnStr + ' ' + (r.autonomousSystemOrganization || ''))
      }
    } catch {}

    return result
  }

  // Async lookup — local DB if available, ip-api.com fallback otherwise
  public async lookupIpFull(ipAddress: string): Promise<GeoResult> {
    if (!ipAddress) return { ...EMPTY }
    // ip-api.com free tier does not support IPv6 — skip it
    if (ipAddress.includes(':')) return { ...EMPTY, ip: ipAddress }
    if (this.remoteCache.has(ipAddress)) return this.remoteCache.get(ipAddress)!
    if (this.hasLocalDb) return this.lookupIp(ipAddress)

    // ip-api.com free tier: no auth, 45 req/min, results cached in memory
    return new Promise<GeoResult>((resolve) => {
      const url = `http://ip-api.com/json/${ipAddress}?fields=status,country,countryCode,regionName,city,isp,org,as`
      const req = net.request(url)
      let body = ''

      req.on('response', (res) => {
        res.on('data',  (chunk) => { body += chunk.toString() })
        res.on('end',   () => {
          try {
            const j = JSON.parse(body)
            if (j.status === 'success') {
              const asnStr = (j.as || '').split(' ')[0] // e.g. "AS13335"
              const result: GeoResult = {
                ip:          ipAddress,
                region:      j.regionName  || 'Unknown',
                country:     j.country     || 'Unknown',
                countryCode: j.countryCode || '',
                city:        j.city        || 'Unknown',
                isp:         j.isp         || 'Unknown',
                asn:         asnStr,
                cdn:         asnToCdn(j.as || '')
              }
              this.remoteCache.set(ipAddress, result)
              resolve(result)
            } else {
              resolve({ ...EMPTY, ip: ipAddress })
            }
          } catch {
            resolve({ ...EMPTY, ip: ipAddress })
          }
        })
      })

      req.on('error', () => resolve({ ...EMPTY, ip: ipAddress }))
      req.end()
    })
  }

  // Fetch the user's own outbound IP via ipify.org then geo-lookup it
  public fetchUserGeo(): Promise<GeoResult> {
    return new Promise<GeoResult>((resolve) => {
      const req = net.request('https://api.ipify.org?format=json')
      let body = ''
      req.on('response', (res) => {
        res.on('data',  (chunk) => { body += chunk.toString() })
        res.on('end',   () => {
          try {
            const { ip } = JSON.parse(body)
            this.lookupIpFull(ip).then(resolve).catch(() => resolve({ ...EMPTY }))
          } catch {
            resolve({ ...EMPTY })
          }
        })
      })
      req.on('error', () => resolve({ ...EMPTY }))
      req.end()
    })
  }
}

export const ipGeolocationService = new IpGeolocationService()
