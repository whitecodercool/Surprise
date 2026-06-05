import * as tls from 'tls'
import WebSocket, { createWebSocketStream } from 'ws'

/**
 * WorkerTunnel
 * 
 * Establishes a Blind TCP Tunnel through a Cloudflare Worker.
 * It connects to the Worker via WebSocket, wraps it into a raw TCP duplex stream,
 * and then negotiates a secure TLS handshake directly with the target server
 * through the stream. Cloudflare is completely blind to the payload.
 */
export class WorkerTunnel {
  /**
   * Establishes a raw TCP Duplex stream through the Worker (for Chromium Proxy).
   */
  static async establishRawTunnel(targetHost: string, targetPort: number, workerUrl: string): Promise<import('stream').Duplex> {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(workerUrl)
        console.log(`[WorkerTunnel] 🛡️ Opening blind pipe to ${targetHost} via ${parsedUrl.hostname}...`)

        const wsUrl = workerUrl.replace(/^http/, 'ws')
        const ws = new WebSocket(wsUrl, {
          headers: {
            'X-Target-Host': targetHost,
            'X-Target-Port': targetPort.toString()
          }
        })

        ws.on('open', () => {
          console.log(`[WorkerTunnel] ⚡ Raw pipe opened to ${targetHost}`)
          const duplexStream = createWebSocketStream(ws)
          resolve(duplexStream)
        })

        ws.on('error', (err) => reject(err))
        ws.on('unexpected-response', (_, res) => reject(new Error(`Worker refused upgrade: ${res.statusCode}`)))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Establishes an End-to-End Encrypted TLS socket through the Worker.
   * 
   * @param targetHost The actual destination (e.g., 'stake.com')
   * @param targetPort The destination port (e.g., 443)
   * @param workerUrl The Cloudflare Worker URL (e.g., 'https://ghostproxy.workers.dev')
   */
  static async establishTLSTunnel(targetHost: string, targetPort: number, workerUrl: string): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(workerUrl)
        
        console.log(`[WorkerTunnel] 🛡️ Opening blind pipe to ${targetHost} via ${parsedUrl.hostname}...`)

        // Replace http/https with ws/wss
        const wsUrl = workerUrl.replace(/^http/, 'ws')

        const ws = new WebSocket(wsUrl, {
          headers: {
            'X-Target-Host': targetHost,
            'X-Target-Port': targetPort.toString()
          }
        })

        ws.on('open', () => {
          console.log(`[WorkerTunnel] ⚡ Pipe opened. Negotiating E2E TLS with ${targetHost}...`)

          // Create a standard Node.js Duplex stream from the WebSocket
          const duplexStream = createWebSocketStream(ws)

          // Initiate the TLS handshake directly with the target, OVER the worker's socket.
          const tlsSocket = tls.connect({
            socket: duplexStream,
            servername: targetHost, // SNI is required by most modern servers
            rejectUnauthorized: false // We handle certificate validation if needed, or bypass MITM
          }, () => {
            console.log(`[WorkerTunnel] 🔒 End-to-End TLS established to ${targetHost} !`)
            resolve(tlsSocket)
          })

          tlsSocket.on('error', (err) => {
            console.error(`[WorkerTunnel] TLS Handshake Error:`, err)
            reject(err)
          })
        })

        ws.on('error', (err) => {
          console.error(`[WorkerTunnel] WebSocket Error:`, err)
          reject(err)
        })

        ws.on('unexpected-response', (_request, response) => {
          console.error(`[WorkerTunnel] Unexpected response from worker: ${response.statusCode}`)
          reject(new Error(`Worker refused upgrade: ${response.statusCode}`))
        })

      } catch (err) {
        reject(err)
      }
    })
  }
}
