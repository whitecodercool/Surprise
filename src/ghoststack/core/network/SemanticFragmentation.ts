import * as tls from 'tls'

/**
 * Semantic Fragmentation Engine
 *
 * Bypasses DPI keyword filters (e.g. blocking "www.pornhat.com") by
 * splitting the semantic unit (the HTTP Host header) across multiple
 * TCP segments with randomized timing gaps.
 *
 * The firewall cannot reconstruct the fragmented semantic unit in real-time
 * and defaults to allowing the traffic. Cloudflare reassembles it perfectly.
 */
export class SemanticFragmentation {
  /**
   * Crafts an HTTP/1.1 request and fragments it across the TLS socket.
   */
  static async sendFragmentedRequest(
    socket: tls.TLSSocket,
    url: string,
    headers: Record<string, string>
  ): Promise<void> {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname
    const path = parsedUrl.pathname + parsedUrl.search

    // Construct raw HTTP/1.1 headers
    let headerStr = `GET ${path} HTTP/1.1\r\n`
    headerStr += `Host: ${hostname}\r\n`

    // Add custom headers
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'host') {
        headerStr += `${key}: ${value}\r\n`
      }
    }

    // End headers
    headerStr += '\r\n'

    const buffer = Buffer.from(headerStr, 'utf-8')

    // Find the critical semantic keyword to split (e.g., "pornhat")
    const hostIdx = headerStr.indexOf('Host: ')

    if (hostIdx !== -1) {
      // Split the buffer right in the middle of the Host header
      const splitPoint = hostIdx + 8 + Math.floor(Math.random() * (hostname.length - 2))

      const chunk1 = buffer.subarray(0, splitPoint)
      const chunk2 = buffer.subarray(splitPoint)

      console.log(`[GhostStack/Semantic] Fragmenting HTTP request at byte ${splitPoint}`)

      socket.write(chunk1)

      // Introduce an entropic timing gap to defeat temporal reassembly buffers
      await this.sleep(Math.floor(Math.random() * 50) + 20)

      socket.write(chunk2)
    } else {
      socket.write(buffer)
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
