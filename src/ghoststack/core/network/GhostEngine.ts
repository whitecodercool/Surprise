import { GhostHandshake } from './GhostHandshake'
import { WorkerTunnel } from './WorkerTunnel'


/**
 * GhostEngine
 * 
 * The master orchestrator for ChronoFlow native evasion.
 * Replaces CORS relays with direct raw TLS connections multiplexed with Semantic Fragmentation.
 */
export class GhostEngine {
  /**
   * Fetches a URL natively over a raw fragmented TLS socket.
   */
  static async fetch(url: string, requestInit?: RequestInit, redirectCount = 0, useWorkerTunnel = false): Promise<Response> {
    return new Promise(async (resolve) => {
      try {
        const parsedUrl = new URL(url)
        const hostname = parsedUrl.hostname
        const port = parsedUrl.port ? parseInt(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80)
        
        // 1. Establish trusted connection
        let socket
        // if (useWorkerTunnel) {
        //   // Hardcoded for now. In production, this would come from a secure config or env var.
        //   const WORKER_URL = 'https://lingering-butterfly-0459.goyalashish367.workers.dev'
        //   try {
        //     socket = await WorkerTunnel.establishTLSTunnel(hostname, port, WORKER_URL)
        //   } catch (e) {
        //     console.error(`[GhostEngine] Worker Tunnel failed, returning original block.`, e)
        //     resolve(new Response('Worker Tunnel Failed', { status: 502 }))
        //     return
        //   }
        // } else {
          socket = await GhostHandshake.establishTrustedConnection(hostname, port)
        // }

        
        // 2. Prepare headers
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*',
          ...((requestInit?.headers as Record<string, string>) || {})
        }
        if (!headers['Host'] && !headers['host']) {
          headers['Host'] = hostname
        }

        // 3. Use Node's built-in HTTP parser over our custom TLS socket
        const http = require('http')
        const agent = new http.Agent({ keepAlive: false })
        ;(agent as any).createConnection = () => socket

        const reqOptions = {
          agent,
          method: requestInit?.method || 'GET',
          headers,
          path: parsedUrl.pathname + parsedUrl.search,
          setHost: false // We explicitly set Host header above
        }

        const req = http.request(reqOptions, (res: any) => {
          const responseHeaders = new Headers()
          for (const [key, value] of Object.entries(res.headers)) {
            if (value) responseHeaders.set(key, Array.isArray(value) ? value.join(',') : (value as string))
          }

          // Handle Redirects natively
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectCount > 10) {
              console.error(`[GhostEngine] Too many redirects`)
              resolve(new Response('Too many redirects', { status: 502 }))
              return
            }
            let location = res.headers.location
            if (location.startsWith('/')) location = `${parsedUrl.origin}${location}`
            
            if (location.includes('bmunet.bmu.edu.in') || location.includes('webcat') || location.includes('sophos') || location.includes('/ips/block/')) {
              console.warn(`[GhostEngine] ⚠️ Firewall block redirect detected → ${location}`)
              if (redirectCount >= 2) {
                resolve(new Response('Firewall Blocked', { status: 503 }))
                return
              }
              GhostEngine.fetch(url, requestInit, redirectCount + 1).then(resolve)
              return
            }

            GhostEngine.fetch(location, requestInit, redirectCount + 1, useWorkerTunnel).then(resolve)
            return
          }

          // Geo-block bypass logic: Fallback to Maximum OPSEC Worker Tunnel on 403/451
          // if ((res.statusCode === 403 || res.statusCode === 451 || res.statusCode === 1020) && !useWorkerTunnel) {
          //   console.log(`[GhostEngine] ⚠️ Server-side block detected (${res.statusCode}) on ${hostname}. Engaging Maximum OPSEC Worker Tunnel...`)
          //   GhostEngine.fetch(url, requestInit, redirectCount, true).then(resolve)
          //   return
          // }

          const noBody = [204, 205, 304].includes(res.statusCode)
          resolve(new Response(noBody ? null : res as any, {
            status: res.statusCode,
            headers: responseHeaders
          }))
        })

        req.on('error', (err: any) => {
          console.error(`[GhostEngine] HTTP Request Error:`, err)
          resolve(new Response('GhostEngine Error', { status: 502 }))
        })

        if (requestInit?.body) {
          req.write(requestInit.body)
        }
        req.end()

      } catch (err) {
        console.error('[GhostEngine] Fetch Error:', err)
        resolve(new Response('GhostEngine Error', { status: 502 }))
      }
    })
  }
}
