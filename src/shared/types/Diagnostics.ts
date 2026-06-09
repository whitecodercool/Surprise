export interface TaskLogEntry {
  id: string
  deviceId?: string
  timestamp: number
  url: string
  status: 'success' | 'failed' | 'running'

  networkInfo: {
    ip: string
    region: string
    country: string
    countryCode?: string
    isp: string
    city?: string
    asn?: string
    cdn?: string
  }

  successInfo?: {
    engine: string
    method: string
    bypassTimeMs: number
  }

  failureDiagnostics?: FailureEnvelope
}

export interface FailureEnvelope {
  errorType: 'TLS_BLOCK' | 'WAF_CAPTCHA' | 'TIMEOUT' | 'DNS_FAILED' | 'UNKNOWN'
  errorMessage: string
  firewallVendor?: string

  timeline: {
    dnsMs: number | null
    tcpMs: number | null
    tlsMs: number | null
    httpMs: number | null
    failedAtStep: 'DNS' | 'TCP' | 'TLS' | 'HTTP' | 'UNKNOWN'
  }

  reproductionCurl: string

  tlsState: {
    ja3Fingerprint?: string
    cipherSuiteUsed?: string
  }

  responseDump: {
    statusCode: number
    headers: Record<string, string>
    bodySnippet: string
  }

  appState: {
    activeProxy: string
    userAgentInjected: string
  }
}
