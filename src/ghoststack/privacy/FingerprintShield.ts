/**
 * GhostStack Fingerprint Shield
 * Complete 10-point fingerprint protection. Deterministic noise per session.
 * @module FingerprintShield
 */


import { UserAgentRotator } from './UserAgentRotator'
import { randomBytes } from 'crypto'

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



export class FingerprintShield {
  private settings: FingerprintSettings
  private uaRotator: UserAgentRotator
  private sessionSeed: number

  constructor() {
    this.uaRotator = new UserAgentRotator()
    this.settings = { level: 'strict', ...PRESETS.strict, timezoneOverride: null }
    this.sessionSeed = randomBytes(4).readUInt32BE(0)
  }

  /** @returns Injectable JavaScript for fingerprint spoofing — all 10 protections */
  getSpoofScript(): string {
    const seed = this.sessionSeed >>> 0
    return `(function() {
      if (window.__ghostStackSpoofed) return true;
      window.__ghostStackSpoofed = true;

      // Seeded xorshift32 PRNG — consistent noise per session, different every launch
      let _s = ${seed} >>> 0;
      function _rng() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return (_s >>> 0) / 0xFFFFFFFF; }
      function _noise(mag) { return (_rng() - 0.5) * 2 * mag; }

      // 1. Canvas fingerprint
      try {
        const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          const ctx = this.getContext && this.getContext('2d');
          if (ctx) { try {
            const d = ctx.getImageData(0, 0, Math.max(this.width,1), Math.max(this.height,1));
            for (let i = 0; i < d.data.length; i += 4) {
              d.data[i]   = Math.max(0, Math.min(255, d.data[i]   + Math.round(_noise(1))));
              d.data[i+1] = Math.max(0, Math.min(255, d.data[i+1] + Math.round(_noise(1))));
              d.data[i+2] = Math.max(0, Math.min(255, d.data[i+2] + Math.round(_noise(1))));
            }
            ctx.putImageData(d, 0, 0);
          } catch(e) {} }
          return _origToDataURL.apply(this, arguments);
        };
      } catch(e) {}
      try {
        const _origGID = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
          const d = _origGID.call(this, x, y, w, h);
          for (let i = 0; i < d.data.length; i += 4) {
            d.data[i]   = Math.max(0, Math.min(255, d.data[i]   + Math.round(_noise(1))));
            d.data[i+1] = Math.max(0, Math.min(255, d.data[i+1] + Math.round(_noise(1))));
            d.data[i+2] = Math.max(0, Math.min(255, d.data[i+2] + Math.round(_noise(1))));
          }
          return d;
        };
      } catch(e) {}
      try {
        const _origMT = CanvasRenderingContext2D.prototype.measureText;
        CanvasRenderingContext2D.prototype.measureText = function(text) {
          const m = _origMT.call(this, text);
          try { Object.defineProperty(m, 'width', { value: m.width + _noise(0.5), configurable: true }); } catch(e) {}
          return m;
        };
      } catch(e) {}

      // 2. WebGL fingerprint
      function _patchWebGL(proto) {
        if (!proto) return;
        const _origGP = proto.getParameter;
        proto.getParameter = function(p) {
          if (p === 0x1F00) return 'Google Inc.';
          if (p === 0x1F01) return 'Google Inc. (Intel)';
          if (p === 0x9246) return 'Google Inc.';
          if (p === 0x9245) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
          return _origGP.call(this, p);
        };
        const _origGE = proto.getExtension;
        proto.getExtension = function(name) {
          if (name === 'WEBGL_debug_renderer_info')
            return { UNMASKED_VENDOR_WEBGL: 0x9246, UNMASKED_RENDERER_WEBGL: 0x9245 };
          return _origGE.call(this, name);
        };
      }
      try { _patchWebGL(WebGLRenderingContext.prototype); } catch(e) {}
      try { _patchWebGL(WebGL2RenderingContext.prototype); } catch(e) {}

      // 3. Audio fingerprint
      try {
        const _AC = window.AudioContext || window.webkitAudioContext;
        if (_AC) {
          const _origCA = _AC.prototype.createAnalyser;
          _AC.prototype.createAnalyser = function() {
            const node = _origCA.call(this);
            const _oFF = node.getFloatFrequencyData.bind(node);
            node.getFloatFrequencyData = function(arr) {
              _oFF(arr); for (let i = 0; i < arr.length; i++) arr[i] += _noise(0.0001);
            };
            const _oBF = node.getByteFrequencyData.bind(node);
            node.getByteFrequencyData = function(arr) {
              _oBF(arr);
              for (let i = 0; i < arr.length; i++)
                arr[i] = Math.max(0, Math.min(255, arr[i] + Math.round(_noise(1))));
            };
            return node;
          };
        }
      } catch(e) {}

      // 4. Font enumeration
      try {
        if (document.fonts && document.fonts.check) {
          const _oFC = document.fonts.check.bind(document.fonts);
          const _sf = ['arial','helvetica','times new roman','courier','verdana',
                       'serif','sans-serif','monospace','cursive','fantasy'];
          document.fonts.check = function(font, text) {
            const n = (font||'').replace(/^[\d.]+px\s*/,'').replace(/['"]/g,'').trim().toLowerCase();
            return _sf.some(f => n.includes(f)) ? _oFC(font, text) : false;
          };
        }
      } catch(e) {}

      // 5. Screen resolution
      try {
        const _res = [[1920,1080],[1366,768],[1536,864],[1440,900],[1280,720]][${seed} % 5];
        Object.defineProperty(screen, 'width',       { get: () => _res[0] });
        Object.defineProperty(screen, 'height',      { get: () => _res[1] });
        Object.defineProperty(screen, 'availWidth',  { get: () => _res[0] });
        Object.defineProperty(screen, 'availHeight', { get: () => _res[1] - 40 });
        Object.defineProperty(screen, 'colorDepth',  { get: () => 24 });
        Object.defineProperty(screen, 'pixelDepth',  { get: () => 24 });
        Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
        Object.defineProperty(window, 'outerWidth',  { get: () => _res[0] });
        Object.defineProperty(window, 'outerHeight', { get: () => _res[1] });
      } catch(e) {}

      // 6. WebRTC IP leak
      try {
        const _ORTC = window.RTCPeerConnection;
        if (_ORTC) {
          const _SRTC = function(cfg) { return new _ORTC(cfg ? Object.assign({}, cfg, { iceServers: [] }) : {}); };
          _SRTC.prototype = _ORTC.prototype;
          window.RTCPeerConnection = _SRTC;
        }
      } catch(e) {}

      // 7. Battery API
      try {
        if (navigator.getBattery) {
          const _fb = { charging:true, chargingTime:0, dischargingTime:Infinity, level:1.0,
                        addEventListener:()=>{}, removeEventListener:()=>{} };
          Object.defineProperty(navigator, 'getBattery', { value: () => Promise.resolve(_fb), configurable: true });
        }
      } catch(e) {}

      // 8. Hardware info
      try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }); } catch(e) {}
      try { Object.defineProperty(navigator, 'deviceMemory',        { get: () => 8 }); } catch(e) {}

      // 9. Timezone
      try {
        const _oRO = Intl.DateTimeFormat.prototype.resolvedOptions;
        Intl.DateTimeFormat.prototype.resolvedOptions = function() {
          return Object.assign({}, _oRO.call(this), { timeZone: 'UTC' });
        };
        Date.prototype.getTimezoneOffset = function() { return 0; };
      } catch(e) {}

      // 10. Language
      try { Object.defineProperty(navigator, 'language',  { get: () => 'en-US' }); } catch(e) {}
      try { Object.defineProperty(navigator, 'languages', { get: () => Object.freeze(['en-US','en']) }); } catch(e) {}

      // navigator.webdriver
      try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch(e) {}

      // sendBeacon passthrough
      if (navigator.sendBeacon) {
        navigator.sendBeacon = new Proxy(navigator.sendBeacon, {
          apply: function(target, thisArg, args) {
            let url = args[0];
            if (typeof url === 'string' && url.startsWith('/')) url = 'https://' + location.host + url;
            try { return Reflect.apply(target, thisArg, [url, args[1]]); }
            catch(e) { fetch(url, { method:'POST', body:args[1], keepalive:true }).catch(()=>{}); return true; }
          }
        });
      }

      return true;
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
