/**
 * GhostStack URL Stripper
 * Detects and removes tracking parameters from URLs to prevent
 * cross-site tracking via link decoration (e.g., fbclid, utm_*).
 * @module URLStripper
 */

/** Comprehensive list of known tracking parameters */
const TRACKING_PARAMS = new Set([
  // Google
  'gclid',
  'dclid',
  'gclsrc',
  '_gl',
  'wbraid',
  'gbraid',
  // Facebook / Instagram
  'fbclid',
  'igshid',
  // Twitter
  'twclid',
  // TikTok
  'ttclid',
  // Microsoft / Bing
  'msclkid',
  // Yandex
  'yclid',
  // Urchin Tracking Module (Standard Analytics)
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  // Mailchimp
  'mc_eid',
  'mc_cid',
  // Hubspot
  '_hsenc',
  '_hsmi',
  '__hssc',
  '__hstc',
  'hsCtaTracking',
  // Marketo
  'mkt_tok',
  // Omeda
  'oly_enc_id',
  'oly_anon_id',
  // Klaviyo
  '_ke',
  // Adobe/Omniture
  's_cid',
  's_kwcid',
  // Matomo / Piwik
  'pk_campaign',
  'pk_kwd',
  'pk_keyword',
  'pk_source',
  'pk_medium',
  'pk_content',
  'pk_cid',
  // General Click IDs
  'click_id',
  'clickid',
  'cid'
])

export class URLStripper {
  /**
   * Cleans a URL by removing known tracking parameters.
   * @param rawUrl - The original URL string
   * @returns The cleaned URL, or null if no tracking parameters were found/removed
   */
  static cleanUrl(rawUrl: string): string | null {
    try {
      const url = new URL(rawUrl)
      let modified = false

      // Collect keys to remove (iterating over searchParams directly while modifying can be problematic)
      const keysToRemove: string[] = []

      for (const [key] of url.searchParams) {
        // Case-insensitive match for tracking parameters
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
          keysToRemove.push(key)
        }
      }

      if (keysToRemove.length === 0) {
        return null // No tracking parameters found
      }

      for (const key of keysToRemove) {
        url.searchParams.delete(key)
        modified = true
      }

      if (modified) {
        // Return the reconstructed URL string
        return url.toString()
      }

      return null
    } catch {
      // Invalid URL or parsing error
      return null
    }
  }

  /**
   * Checks if a URL contains known tracking parameters without modifying it.
   */
  static hasTrackingParams(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl)
      for (const [key] of url.searchParams) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) return true
      }
      return false
    } catch {
      return false
    }
  }
}
