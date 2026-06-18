import { protocol, session } from 'electron'
import * as http from 'http'
import { Readable } from 'stream'
import { GhostEngine } from './GhostEngine'
import { Web3Resolver } from '../../dns/Web3Resolver'

const web3Resolver = new Web3Resolver()

async function getWeb3GatewayUrl(originalUrl: string): Promise<string> {
  try {
    const parsed = new URL(originalUrl)
    if (parsed.hostname.endsWith('.eth')) {
      const result = await web3Resolver.resolve(parsed.hostname)
      if (result) {
        if (result.startsWith('ipfs://')) {
          const cid = result.replace('ipfs://', '')
          return `https://dweb.link/ipfs/${cid}${parsed.pathname}${parsed.search}`
        } else if (result.startsWith('ipns://')) {
          const cid = result.replace('ipns://', '')
          return `https://dweb.link/ipns/${cid}${parsed.pathname}${parsed.search}`
        }
      }
    }
  } catch {}
  return originalUrl
}

/**
 * GhostProtocol v5 — Local Media Relay
 *
 * Architecture:
 *   1. ghost:// protocol handler serves HTML pages via CORS relay cascade.
 *   2. A LOCAL HTTP server on 127.0.0.1 handles ALL sub-resources (CSS/JS/images/video).
 *      Localhost traffic is NEVER inspected by Sophos. This fixes video playback.
 *   3. HTML is rewritten so all resource URLs point to http://127.0.0.1:PORT/r/ENCODED_URL
 *   4. The injected JS interceptor catches dynamic fetch/XHR and routes them to localhost too.
 */

// ── In-memory cache ──
const cache = new Map<string, { buf: Buffer; mime: string; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE = 400

function cacheSet(key: string, buf: Buffer, mime: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { buf, mime, ts: Date.now() })
}

function cacheGet(key: string): { buf: Buffer; mime: string } | null {
  const e = cache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return e
}

// ── MIME types ──
const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ts: 'video/mp2t',
  m3u8: 'application/vnd.apple.mpegurl',
  m4s: 'video/iso.segment',
  mpd: 'application/dash+xml',
  xml: 'application/xml',
  txt: 'text/plain'
}

function getMime(url: string): string | null {
  try {
    const p = new URL(url, 'https://x.com').pathname.split('?')[0]
    const ext = p.split('.').pop()?.toLowerCase() || ''
    return MIME[ext] || null
  } catch {
    return null
  }
}

// ── Local relay server port ──
let localRelayPort = 0
export function getRelayPort(): number {
  return localRelayPort
}
let blockedBaseDomain = ''

// ═══════════════════════════════════════════════════
// LOCAL HTTP RELAY SERVER
// Handles ALL sub-resources (CSS, JS, images, VIDEO)
// Localhost traffic bypasses Sophos entirely.
// ═══════════════════════════════════════════════════
function isPublicUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const h = url.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false
  if (
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  )
    return false
  return true
}

function startLocalRelay(): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1`)
        let targetUrl = reqUrl.searchParams.get('u')

        if (reqUrl.pathname === '/log') {
          const msg = (reqUrl.searchParams.get('msg') || '').replace(/[\x00-\x1f\x7f]/g, '')
          console.log(`[GhostStack/FrontendLog] ${msg}`)
          res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end('ok')
          return
        }

        if (!targetUrl) {
          // Try to recover the target URL from the Referer (fixes relative URLs requested by iframes/scripts)
          if (req.headers.referer) {
            try {
              const refererUrl = new URL(req.headers.referer)
              const refererTarget = refererUrl.searchParams.get('u')
              if (refererTarget) {
                const baseTarget = new URL(refererTarget)
                targetUrl = new URL(req.url || '/', baseTarget.origin).href
                console.log(`[GhostProtocol] 🔄 Recovered relative URL: ${targetUrl}`)
              }
            } catch {
              // ignore parse errors
            }
          }

          if (!targetUrl) {
            console.error(`[GhostProtocol] ❌ Relay missing 'u' param for: ${req.url}`)
            res.writeHead(400)
            res.end('Missing u param')
            return
          }
        }

        if (!isPublicUrl(targetUrl)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        // CORS headers for cross-origin requests from ghost:// page
        const origin = req.headers.origin || '*'
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS')
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers'] || '*'
        )
        res.setHeader('Access-Control-Expose-Headers', '*')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        // Check cache
        const cached = cacheGet(targetUrl)
        if (cached) {
          res.writeHead(200, {
            'Content-Type': cached.mime,
            'Content-Length': cached.buf.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=86400'
          })
          res.end(cached.buf)
          return
        }

        // Forward essential headers to bypass hotlink protection
        const fetchHeaders: Record<string, string> = {}
        const blockedHeaders = ['host', 'accept-encoding']

        for (const [key, val] of Object.entries(req.headers)) {
          if (val && !blockedHeaders.includes(key.toLowerCase())) {
            fetchHeaders[key] = Array.isArray(val) ? val.join(';') : val
          }
        }

        // Fake Referer and Origin if missing or internal
        if (
          !fetchHeaders['referer'] ||
          fetchHeaders['referer'].includes('127.0.0.1') ||
          fetchHeaders['referer'].includes('ghost://')
        ) {
          fetchHeaders['Referer'] = `https://www.${blockedBaseDomain}/`
        }
        if (
          fetchHeaders['origin'] &&
          (fetchHeaders['origin'].includes('127.0.0.1') ||
            fetchHeaders['origin'].includes('ghost://'))
        ) {
          fetchHeaders['Origin'] = `https://www.${blockedBaseDomain}`
        }

        // Fetch cookies from Electron's session for the target URL
        try {
          const cookies = await session.defaultSession.cookies.get({ url: targetUrl })
          if (cookies.length > 0) {
            fetchHeaders['Cookie'] = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          }
        } catch (e) {
          console.error('[GhostProtocol] Error fetching cookies:', e)
        }

        // Forward method and body for API requests (POST/PUT)
        const fetchOptions: RequestInit = {
          method: req.method || 'GET',
          headers: fetchHeaders
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          fetchOptions.body = Buffer.concat(chunks) as unknown as BodyInit
        }

        // Fetch via GhostEngine native bypass, with GhostSwarm P2P fallback
        let response: Response | null = null

        try {
          const finalUrl = await getWeb3GatewayUrl(targetUrl)
          response = await GhostEngine.fetch(finalUrl, fetchOptions)
          if (response.ok) {
            console.log(
              `[GhostProtocol] ✅ Relay ${response.status}: ${targetUrl.substring(0, 80)}`
            )
          }
        } catch (engineErr) {
          console.warn(`[GhostProtocol] GhostEngine failed for ${targetUrl}:`, engineErr)
        }

        if (!response) {
          console.error(`[GhostProtocol] ❌ All engines failed for: ${targetUrl}`)
          res.writeHead(502)
          res.end(`Relay failed: 502`)
          return
        }

        const mime = getMime(targetUrl) || response.headers.get('content-type') || 'text/plain'

        const resHeaders: Record<string, string> = {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'public, max-age=86400',
          'Accept-Ranges': 'bytes'
        }
        const isText =
          mime.includes('text/') ||
          mime.includes('javascript') ||
          mime.includes('json') ||
          mime.includes('mpegurl') ||
          mime.includes('m3u8')

        if (isText) {
          // For text resources, buffer and rewrite URLs
          const arrayBuf = await response.arrayBuffer()
          let text = Buffer.from(arrayBuf).toString('utf-8')

          if (mime.includes('mpegurl') || mime.includes('m3u8') || targetUrl.includes('.m3u8')) {
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
            const relay = (u: string) =>
              `http://127.0.0.1:${localRelayPort}/r?u=${encodeURIComponent(u)}`
            text = text
              .split('\n')
              .map((line) => {
                const tLine = line.trim()
                // Rewrite EXT-X-KEY URI (encryption keys must go through relay)
                if (tLine.startsWith('#EXT-X-KEY') && tLine.includes('URI="')) {
                  return line.replace(/URI="(https?:\/\/[^"]+)"/g, (_, u) => `URI="${relay(u)}"`)
                }
                // Rewrite segment/playlist lines — both absolute and relative
                if (tLine && !tLine.startsWith('#')) {
                  const absoluteUrl = tLine.startsWith('http')
                    ? tLine
                    : tLine.startsWith('/')
                      ? new URL(tLine, targetUrl).href
                      : baseUrl + tLine
                  return relay(absoluteUrl)
                }
                return line
              })
              .join('\n')
          }
          if (targetUrl.includes('imasdk.googleapis.com')) {
            // Patch Google IMA SDK protocol check so it doesn't crash the video player
            text = text.replace(/document\.location\.protocol/g, '"https:"')
            text = text.replace(/window\.location\.protocol/g, '"https:"')
            text = text.replace(
              /throw Error\("IMA SDK is either not loaded from a google domain/g,
              'console.warn("Patched IMA SDK'
            )
            text = text.replace(
              /throw new Error\("IMA SDK is either not loaded from a google domain/g,
              'console.warn("Patched IMA SDK'
            )
          }

          const finalBuf = Buffer.from(text, 'utf-8')
          cacheSet(targetUrl, finalBuf, mime)

          resHeaders['Content-Length'] = finalBuf.length.toString()
          res.writeHead(response.status, resHeaders)
          res.end(finalBuf)
        } else {
          if (response.headers.has('content-length'))
            resHeaders['Content-Length'] = response.headers.get('content-length')!
          if (response.headers.has('content-range'))
            resHeaders['Content-Range'] = response.headers.get('content-range')!
          if (response.headers.has('content-encoding'))
            resHeaders['Content-Encoding'] = response.headers.get('content-encoding')!

          res.writeHead(response.status, resHeaders)

          // For binary resources (video/images), stream directly!
          if (response.body) {
            if (typeof (response.body as unknown as Readable).pipe === 'function') {
              ;(response.body as unknown as Readable).pipe(res)
            } else {
              // Convert Web ReadableStream to Node stream
              const nodeStream = Readable.fromWeb(
                response.body as import('stream/web').ReadableStream
              )
              nodeStream.on('error', (err: Error) =>
                console.error('[GhostProtocol] Stream error:', err)
              )
              nodeStream.pipe(res)
            }
          } else {
            res.end()
          }
        }
      } catch (err) {
        console.error('[GhostProtocol] ❌ Relay error:', err)
        res.writeHead(502)
        res.end('Relay error')
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      localRelayPort = addr.port
      console.log(`[GhostProtocol] 🛡️ Local media relay on 127.0.0.1:${localRelayPort}`)
      resolve(localRelayPort)
    })
  })
}

// ═══════════════════════════════════════════════════
// GHOST:// PROTOCOL HANDLER — HTML documents only
// ═══════════════════════════════════════════════════
export async function initializeGhostProtocol(): Promise<void> {
  // Start local relay server first
  await startLocalRelay()

  protocol.handle('ghost', async (request) => {
    try {
      // Fix double ghost:// URLs
      let rawUrl = request.url
      const secondGhost = rawUrl.indexOf('ghost://', 8)
      if (secondGhost !== -1) rawUrl = rawUrl.substring(secondGhost)

      const targetUrl = new URL(rawUrl.replace('ghost://', 'https://'))
      const hostname = targetUrl.hostname
      const fullPath = targetUrl.pathname + targetUrl.search
      const realUrl = targetUrl.href

      blockedBaseDomain = hostname.replace(/^www\./, '')

      console.log(`[GhostProtocol] 📄 ${hostname}${fullPath.substring(0, 60)}`)

      // Convert request Headers to Record
      const fetchHeaders: Record<string, string> = {}
      const blockedHeaders = ['host', 'accept-encoding']

      request.headers.forEach((val, key) => {
        if (!blockedHeaders.includes(key.toLowerCase())) fetchHeaders[key] = val
      })

      // Fake Referer and Origin for top-level navigation and APIs that slip through
      if (!fetchHeaders['referer'] || fetchHeaders['referer'].includes('ghost://')) {
        fetchHeaders['Referer'] = `https://${hostname}/`
      }
      if (fetchHeaders['origin'] && fetchHeaders['origin'].includes('ghost://')) {
        fetchHeaders['Origin'] = `https://${hostname}`
      }

      const fetchOptions: RequestInit = {
        method: request.method,
        headers: fetchHeaders
      }

      if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
        const reader = (request.body as unknown as ReadableStream<Uint8Array>).getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(value)
        }
        fetchOptions.body = Buffer.concat(chunks)
      }

      // Fetch HTML via GhostEngine Native Bypass, with GhostSwarm P2P fallback
      let resp: Response | null = null

      try {
        const finalUrl = await getWeb3GatewayUrl(realUrl)
        resp = await GhostEngine.fetch(finalUrl, fetchOptions)
      } catch (engineErr) {
        console.warn(`[GhostProtocol] GhostEngine failed for ${realUrl}:`, engineErr)
      }

      if (!resp) {
        throw new Error(`All bypass engines failed (no response)`)
      }

      const mime = getMime(realUrl) || resp.headers.get('content-type') || 'text/html'

      // If a binary resource slips through to ghost:// (like a video chunk or image), stream it back
      if (!mime.includes('text/html')) {
        const headers: Record<string, string> = {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*'
        }

        // CRITICAL for video players: pass Range headers back
        if (resp.headers.has('content-length'))
          headers['Content-Length'] = resp.headers.get('content-length')!
        if (resp.headers.has('content-range'))
          headers['Content-Range'] = resp.headers.get('content-range')!
        if (resp.headers.has('accept-ranges'))
          headers['Accept-Ranges'] = resp.headers.get('accept-ranges')!

        // Return the raw stream directly instead of buffering the entire file into RAM!
        // This allows video players to perform chunked buffering properly.
        return new Response(resp.body, {
          status: resp.status,
          headers
        })
      }

      let html = await resp.text()
      const isWeb3 = realUrl.includes('.eth') || realUrl.includes('.crypto')
      html = rewriteHtml(html, isWeb3)

      console.log(`[GhostProtocol] ✅ Rendered ${hostname} (${(html.length / 1024).toFixed(0)}KB)`)

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      })
    } catch (err) {
      console.error('[GhostProtocol] Error:', err)
      const errMsg = String(err)

      // Distinguish DNS failures from bypass failures
      let title = 'GhostStack — relay error'
      let detail = String(err)

      if (
        errMsg.includes('domain may not exist') ||
        errMsg.includes('ENOTFOUND') ||
        errMsg.includes('DNS resolution failed')
      ) {
        title = 'GhostStack — domain not found'
        detail = `The domain could not be resolved via any DNS server (including encrypted DoH). This domain may not exist or may be completely unreachable.`
      } else if (errMsg.includes('All bypass engines failed')) {
        title = 'GhostStack — bypass failed'
        detail = `GhostStack tried all available bypass methods but the site returned an error. The site may be down or blocking all connections.`
      }

      // Return a proper error Response — throwing from a protocol handler causes ERR_UNEXPECTED
      // and triggers an infinite retry loop in TabManager's did-fail-load handler.
      return new Response(
        `<html><body style="font-family:sans-serif;padding:2rem"><h2>${title}</h2><pre>${detail}</pre></body></html>`,
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }
  })
}

/**
 * Builds the GhostStack injector script embedded into every ghost:// page.
 *
 * It runs at the very top of <head>, before any player scripts, and does two things:
 *
 * 1. Location protocol spoof — patches Location.prototype so player code that checks
 *    location.protocol / .href / .origin sees 'https:' instead of 'ghost:'.
 *
 * 2. fetch + XHR relay intercept — rewrites ALL JavaScript-initiated HTTPS requests to
 *    go through the local relay (http://127.0.0.1:PORT/r?u=...). This is belt-and-suspenders
 *    alongside onBeforeRequest: it covers race conditions (requests fired before did-navigate
 *    commits the ghost:// URL), sub-frame scripts, and any edge cases the Electron-level
 *    interceptor can miss.
 */
function buildGhostInjector(port: number): string {
  return `<script id="gs-injector">(function(){
var R='http://127.0.0.1:${port}/r?u=';
function needsRelay(u){return typeof u==='string'&&u.startsWith('https://')&&!u.includes('127.0.0.1');}
try{
  var L=Location.prototype;
  function pg(p,fn){var d=Object.getOwnPropertyDescriptor(L,p);if(d&&d.get)Object.defineProperty(L,p,{get:function(){return fn(d.get.call(this));},configurable:true,enumerable:true});}
  pg('protocol',function(v){return v==='ghost:'?'https:':v;});
  pg('href',function(v){return v.startsWith('ghost://')?'https://'+v.slice(8):v;});
  pg('origin',function(v){return v.startsWith('ghost://')?'https://'+v.slice(8):v;});
}catch(e){}
try{
  var _f=window.fetch;
  window.fetch=function(i,o){
    if(typeof i==='string'&&needsRelay(i)){i=R+encodeURIComponent(i);}
    else if(i instanceof Request&&needsRelay(i.url)){i=new Request(R+encodeURIComponent(i.url),i);}
    return _f.call(this,i,o);
  };
  var _x=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(){
    if(needsRelay(arguments[1]))arguments[1]=R+encodeURIComponent(arguments[1]);
    return _x.apply(this,arguments);
  };
}catch(e){}
try{
  if(navigator.sendBeacon){
    var _sb=navigator.sendBeacon;
    Object.defineProperty(navigator, 'sendBeacon', {
      value: function(url, data) {
        if(typeof url==='string'){
          if(url.startsWith('/')) url='https://'+location.host+url;
          if(needsRelay(url)) url=R+encodeURIComponent(url);
        }
        try {
          return _sb.call(navigator, url, data);
        } catch (e) {
          window.fetch(url, { method: 'POST', body: data, keepalive: true }).catch(function(){});
          return true;
        }
      },
      writable: true,
      configurable: true
    });
  }
}catch(e){}
})();</script>`
}

function rewriteHtml(html: string, isWeb3: boolean = false): string {
  // Strip integrity attributes so rewritten scripts don't fail SRI checks
  html = html.replace(/\s+integrity=["'][^"']*["']/gi, '')

  // Strip CSP and Trusted Types meta tags that could block our local relay or inline scripts
  html = html.replace(
    /<meta[^>]*http-equiv=["']?(?:Content-Security-Policy|Require-Trusted-Types-For|origin-trial)["']?[^>]*>/gi,
    ''
  )
  // Catch alternate attributes ordering (content before http-equiv)
  html = html.replace(
    /<meta[^>]*content=["'][^"']*["'][^>]*http-equiv=["']?(?:Content-Security-Policy|Require-Trusted-Types-For|origin-trial)["']?[^>]*>/gi,
    ''
  )

  // ── Convert protocol-relative to absolute ──
  const urlAttrs = '(?:src|href|poster|srcset|data-[a-zA-Z0-9-]+)'
  html = html.replace(new RegExp(`(${urlAttrs}=["'])\\/\\/([^"']*?)(["'])`, 'gi'), `$1https://$2$3`)

  // Inject as early as possible so player scripts see https: and requests go through relay
  let injector = buildGhostInjector(localRelayPort)

  if (isWeb3) {
    // Inject a strict Content-Security-Policy to sandbox Web3 domains and block unauthorized cross-site tracking/execution
    const web3Csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' http://127.0.0.1:* blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:*; style-src 'self' 'unsafe-inline' http://127.0.0.1:*; connect-src 'self' http://127.0.0.1:* wss://* https://*; img-src * data: blob:; media-src * data: blob:;">`
    injector = web3Csp + injector
  }

  if (html.includes('<head>')) {
    html = html.replace('<head>', '<head>' + injector)
  } else if (/<head[\s>]/i.test(html)) {
    html = html.replace(/<head(\s[^>]*)?>/, (m) => m + injector)
  } else {
    html = injector + html
  }

  return html
}
