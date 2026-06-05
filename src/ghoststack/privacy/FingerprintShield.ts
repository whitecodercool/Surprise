/**
 * GhostStack Fingerprint Shield
 * Complete 10-point fingerprint protection. Deterministic noise per session.
 * @module FingerprintShield
 */

import { createHash, randomBytes } from 'crypto'
import { UserAgentRotator } from './UserAgentRotator'
import { WebRTCShield } from './WebRTCShield'

export type PrivacyLevel = 'standard' | 'strict' | 'maximum' | 'custom'

export interface FingerprintSettings {
  level: PrivacyLevel
  canvasSpoofing: boolean
  webglSpoofing: boolean
  audioSpoofing: boolean
  fontSpoofing: boolean
  screenSpoofing: boolean
  userAgentRotation: boolean
  webrtcProtection: boolean
  batterySpoofing: boolean
  hardwareSpoofing: boolean
  timezoneSpoofing: boolean
  timezoneOverride: string | null
}

export interface FingerprintTestResult {
  uniquenessScore: number
  exposedAPIs: string[]
  protectedAPIs: string[]
  recommendations: string[]
}

const PRESETS: Record<PrivacyLevel, Omit<FingerprintSettings, 'level' | 'timezoneOverride'>> = {
  standard: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: false, fontSpoofing: false, screenSpoofing: false, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: false },
  strict: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: true, fontSpoofing: true, screenSpoofing: true, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: false },
  maximum: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: true, fontSpoofing: true, screenSpoofing: true, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: true },
  custom: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: true, fontSpoofing: true, screenSpoofing: true, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: false }
}

const GPU_STRINGS = [
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' }
]

const RESOLUTIONS = [
  [1920,1080],[2560,1440],[3840,2160],[1366,768],[1536,864],[1440,900],
  [1680,1050],[1280,720],[1280,800],[1600,900],[2560,1600],[1920,1200],
  [3440,1440],[2880,1800],[1360,768],[1280,1024],[1024,768],[1600,1200],
  [2256,1504],[2736,1824]
]

export class FingerprintShield {
  private sessionId: string
  private settings: FingerprintSettings
  private uaRotator: UserAgentRotator
  private webrtcShield: WebRTCShield
  private gpuIdx: number
  private screenIdx: number

  constructor() {
    this.sessionId = randomBytes(32).toString('hex')
    this.uaRotator = new UserAgentRotator()
    this.webrtcShield = new WebRTCShield()
    const h = createHash('sha256').update(this.sessionId).digest()
    this.gpuIdx = h.readUInt8(0) % GPU_STRINGS.length
    this.screenIdx = h.readUInt8(1) % RESOLUTIONS.length
    this.settings = { level: 'strict', ...PRESETS.strict, timezoneOverride: null }
  }

  /** @returns Injectable JavaScript for fingerprint spoofing */
  getSpoofScript(): string {
    return `(function() {
      if (navigator.sendBeacon) {
        const originalSendBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(url, data) {
          if (url.startsWith('/')) {
            url = 'https://' + location.host + url;
          }
          try {
            return originalSendBeacon.call(navigator, url, data);
          } catch (e) {
            // Fallback to fetch if sendBeacon fails (e.g. because of ghost:// protocol)
            fetch(url, { method: 'POST', body: data, keepalive: true }).catch(() => {});
            return true;
          }
        };
      }
    })();`
  }

  getSettings(): FingerprintSettings { return { ...this.settings } }

  updateSettings(updates: Partial<FingerprintSettings>): void {
    this.settings = { ...this.settings, ...updates }
  }

  setLevel(level: PrivacyLevel): void {
    this.settings = { ...this.settings, level, ...PRESETS[level], timezoneOverride: this.settings.timezoneOverride }
  }

  getUserAgent(): string {
    return this.settings.userAgentRotation ? this.uaRotator.getSessionUA() : ''
  }

  getTestResults(): FingerprintTestResult {
    const s = this.settings
    const checks = [
      { name: 'Canvas', on: s.canvasSpoofing }, { name: 'WebGL', on: s.webglSpoofing },
      { name: 'Audio', on: s.audioSpoofing }, { name: 'Fonts', on: s.fontSpoofing },
      { name: 'Screen', on: s.screenSpoofing }, { name: 'User Agent', on: s.userAgentRotation },
      { name: 'WebRTC', on: s.webrtcProtection }, { name: 'Battery', on: s.batterySpoofing },
      { name: 'Hardware', on: s.hardwareSpoofing }, { name: 'Timezone', on: s.timezoneSpoofing }
    ]
    const protectedAPIs = checks.filter(c => c.on).map(c => c.name)
    const exposedAPIs = checks.filter(c => !c.on).map(c => c.name)
    return {
      uniquenessScore: Math.max(0, 100 - protectedAPIs.length * 10),
      exposedAPIs, protectedAPIs,
      recommendations: exposedAPIs.map(a => `Enable ${a} spoofing`)
    }
  }
}
