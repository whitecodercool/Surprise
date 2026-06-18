/**
 * GhostStack CNAME Detector — detects CNAME cloaking trackers.
 * @module CNAMEDetector
 */
import { queryCNAME } from '../dns/DoHClient'

const TRACKER_CNAMES = [
  'adobedtm.com',
  'omtrdc.net',
  'demdex.net',
  '2o7.net',
  'sc.omtrdc.net',
  'data.adobedc.net',
  'siteintercept.qualtrics.com',
  'pardot.com',
  'tags.tiqcdn.com',
  'ensighten.com',
  'cdn.krxd.net',
  'pippio.com',
  'imrworldwide.com',
  'agkn.com',
  'go-mpulse.net',
  'akstat.io'
]

export class CNAMEDetector {
  /** Check if a domain uses CNAME cloaking to a known tracker */
  async isTrackerCNAME(domain: string): Promise<boolean> {
    try {
      const cnames = await queryCNAME(domain, 'cloudflare', 3000)
      for (const cname of cnames) {
        const lower = cname.toLowerCase()
        if (TRACKER_CNAMES.some((t) => lower.includes(t))) return true
      }
    } catch {}
    return false
  }
}
