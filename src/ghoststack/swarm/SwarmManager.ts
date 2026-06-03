import { ipcMain, WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'

export type SwarmStatus = 'disconnected' | 'connecting' | 'connected' | 'failed'
export type SwarmRole = 'relay' | 'client' | 'none'

interface PendingRequest {
  resolve: (response: SwarmResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export interface SwarmResponse {
  status: number
  headers: Record<string, string>
  data: Buffer
}

export class SwarmManager extends EventEmitter {
  private workerContents: WebContents | null = null
  private status: SwarmStatus = 'disconnected'
  private role: SwarmRole = 'none'
  private pendingRequests = new Map<string, PendingRequest>()
  
  // Buffers for accumulating binary chunks
  private responseMetadata = new Map<string, any>()
  private responseChunks = new Map<string, Buffer[]>()

  constructor() {
    super()
    this.setupIpc()
  }

  setWorker(contents: WebContents) {
    this.workerContents = contents
  }

  getStatus() {
    return { status: this.status, role: this.role }
  }

  private isWorkerReady = false
  private pendingStartRole: SwarmRole | null = null

  start(networkType: 'open' | 'filtered' | 'heavily_restricted' | 'unknown') {
    if (!this.workerContents) return

    console.log(`[SwarmManager] Detected network type: ${networkType}`)
    this.role = (networkType === 'open' || networkType === 'unknown') ? 'relay' : 'client'
    this.status = 'connecting'
    this.emit('status-changed', this.getStatus())
    
    if (this.isWorkerReady) {
      this.workerContents.send('swarm:init', this.role)
    } else {
      this.pendingStartRole = this.role
    }
  }

  stop() {
    this.status = 'disconnected'
    this.role = 'none'
    this.pendingStartRole = null
    this.emit('status-changed', this.getStatus())
    // Hard reset pending
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer)
      req.reject(new Error('Swarm stopped'))
      this.pendingRequests.delete(id)
    }
  }

  private setupIpc() {
    ipcMain.on('swarm:ready', () => {
      console.log('[SwarmManager] Received swarm:ready from worker')
      this.isWorkerReady = true
      
      const roleToStart = this.pendingStartRole || (this.role !== 'none' ? this.role : null)
      
      if (roleToStart && this.workerContents) {
        console.log(`[SwarmManager] Sending swarm:init with role: ${roleToStart}`)
        this.workerContents.send('swarm:init', roleToStart)
        this.pendingStartRole = null
      } else {
        console.log(`[SwarmManager] No role to start yet`)
      }
    })

    ipcMain.on('swarm:status', (_event, data) => {
      this.status = data.status
      if (data.role) this.role = data.role
      this.emit('status-changed', this.getStatus())
      console.log(`[SwarmManager] Status: ${this.status} (${this.role})`)
    })

    ipcMain.on('swarm:metadata', (_event, metadata) => {
      this.responseMetadata.set(metadata.reqId, metadata)
    })

    ipcMain.on('swarm:response', (_event, payload) => {
      const { reqId, data } = payload
      const chunks = this.responseChunks.get(reqId) || []
      chunks.push(Buffer.from(data))
      this.responseChunks.set(reqId, chunks)
    })

    ipcMain.on('swarm:eof', (_event, reqId) => {
      const meta = this.responseMetadata.get(reqId)
      const pending = this.pendingRequests.get(reqId)
      const chunks = this.responseChunks.get(reqId) || []
      
      if (meta && pending) {
        clearTimeout(pending.timer)
        pending.resolve({
          status: meta.status,
          headers: meta.headers,
          data: Buffer.concat(chunks)
        })
        this.pendingRequests.delete(reqId)
        this.responseMetadata.delete(reqId)
        this.responseChunks.delete(reqId)
      }
    })

    ipcMain.on('swarm:error', (_event, payload) => {
      const { reqId, error } = payload
      const pending = this.pendingRequests.get(reqId)
      if (pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error(error))
        this.pendingRequests.delete(reqId)
        this.responseMetadata.delete(reqId)
        this.responseChunks.delete(reqId)
      }
    })
  }

  /**
   * Called by GhostProtocol to fetch a blocked URL over the P2P network.
   */
  async fetch(url: string, options: RequestInit = {}): Promise<SwarmResponse> {
    if (this.status !== 'connected' || this.role !== 'client') {
      throw new Error('Swarm tunnel not ready')
    }

    if (!this.workerContents) {
      throw new Error('Worker not attached')
    }

    const reqId = randomUUID()
    
    const reqData: any = {
      reqId,
      url,
      method: options.method || 'GET',
      headers: options.headers || {}
    }

    if (options.body) {
      reqData.body = Buffer.isBuffer(options.body) 
        ? options.body.toString('base64') 
        : Buffer.from(options.body as string).toString('base64')
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId)
        this.responseMetadata.delete(reqId)
        this.responseChunks.delete(reqId)
        reject(new Error('Swarm request timeout'))
      }, 30000)

      this.pendingRequests.set(reqId, { resolve, reject, timer })
      this.workerContents!.send('swarm:request', reqData)
    })
  }
}
