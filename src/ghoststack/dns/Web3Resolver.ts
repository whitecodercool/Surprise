import { ethers, FetchRequest } from 'ethers'
import { GhostEngine } from '../core/network/GhostEngine'

/**
 * Web3Resolver
 * Native resolution for blockchain domains (.eth)
 * Queries public RPCs securely via GhostEngine SplitCast to prevent IP/RPC leaks.
 */
export class Web3Resolver {
  private provider: ethers.JsonRpcProvider

  constructor() {
    // 1. Create a custom FetchRequest to force all RPC calls through our DPI Evasion engine
    const fetchReq = new FetchRequest('https://ethereum-rpc.publicnode.com')

    fetchReq.getUrlFunc = async (req: FetchRequest, _signal?: any) => {
      const headers: Record<string, string> = {}
      for (const key in req.headers) {
        if (key.toLowerCase() !== 'accept-encoding') {
          headers[key] = (req.headers as any)[key]
        }
      }
      headers['Accept-Encoding'] = 'identity'

      const init: RequestInit = {
        method: req.method,
        headers,
        body: (req.hasBody() ? req.body : undefined) as BodyInit | undefined
      }

      console.log(`[Web3Resolver] 🔒 Securely querying RPC: ${req.url}`)
      const response = await GhostEngine.fetch(req.url, init)

      const bodyBuffer = await response.arrayBuffer()
      const bodyText = new TextDecoder().decode(bodyBuffer).substring(0, 200)
      console.log(
        `[Web3Resolver] RPC Response: ${response.status} ${response.statusText} - Body: ${bodyText}`
      )

      // Convert standard Fetch Headers to Record
      const resHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        resHeaders[key] = value
      })

      return {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: resHeaders,
        body: new Uint8Array(bodyBuffer)
      }
    }

    this.provider = new ethers.JsonRpcProvider(fetchReq)
  }

  /**
   * Resolves a Web3 domain.
   * @returns ipfs:// or ipns:// CID, or a raw IP address if configured.
   */
  async resolve(domain: string): Promise<string | null> {
    if (!domain.endsWith('.eth')) return null

    try {
      console.log(`[Web3Resolver] Resolving ${domain} on Ethereum blockchain...`)

      // 1. Get the ENS Resolver contract for this domain
      const resolver = await this.provider.getResolver(domain)
      if (!resolver) {
        console.warn(`[Web3Resolver] No ENS resolver found for ${domain}`)
        return null
      }

      // 2. Fetch the Content Hash (IPFS/IPNS/Swarm)
      const contentHash = await resolver.getContentHash()
      if (contentHash) {
        console.log(`[Web3Resolver] ✅ Found decentralized content for ${domain} -> ${contentHash}`)
        return contentHash
      }

      // 3. Fallback: Does the ENS record point to a standard IP?
      const ip = await this.provider.resolveName(domain)
      if (ip) {
        console.log(`[Web3Resolver] ✅ Found standard IP for ${domain} -> ${ip}`)
        return ip
      }

      return null
    } catch (e: any) {
      console.error(`[Web3Resolver] ❌ Failed to resolve ${domain}:`, e.message)
      return null
    }
  }
}
