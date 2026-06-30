import { useState, useEffect } from 'react'
import type { TaskLogEntry } from '../../shared/types/Diagnostics'
import { DiagnosticsModal } from './DiagnosticsModal'

export function DiagnosticsLogList() {
  const [logs, setLogs] = useState<TaskLogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<TaskLogEntry | null>(null)

  useEffect(() => {
    const unsubscribe = window.api?.onGhoststackLogEntry?.((newLog: TaskLogEntry) => {
      setLogs((prev) => [newLog, ...prev].slice(0, 50)) // Keep last 50
    })

    // Add a mocked log for demonstration if list is empty initially
    setLogs([
      {
        id: 'demo-1',
        timestamp: Date.now() - 5000,
        url: 'https://restricted-site.com/login',
        status: 'failed',
        networkInfo: {
          ip: '104.18.2.1',
          region: 'California',
          country: 'US',
          isp: 'Cloudflare, Inc.'
        },
        failureDiagnostics: {
          errorType: 'WAF_CAPTCHA',
          errorMessage: 'Blocked by Cloudflare CAPTCHA Challenge',
          timeline: { dnsMs: 12, tcpMs: 44, tlsMs: 150, httpMs: 80, failedAtStep: 'HTTP' },
          reproductionCurl:
            'curl -v -H "User-Agent: Mozilla/5.0" https://restricted-site.com/login',
          tlsState: {
            ja3Fingerprint: 'mocked-ja3-hash',
            cipherSuiteUsed: 'TLS_AES_128_GCM_SHA256'
          },
          responseDump: {
            statusCode: 403,
            headers: { server: 'cloudflare' },
            bodySnippet:
              '<!DOCTYPE html><html><body><h1>Please turn on JavaScript and reload the page.</h1>...</body></html>'
          },
          appState: { activeProxy: 'Node.js Engine', userAgentInjected: 'Spoofed' }
        }
      }
    ])

    return unsubscribe
  }, [])

  return (
    <div className="mt-6 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Diagnostic Logs
      </h3>
      <div className="bg-[#0a0a0f] border border-[#222] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-[#111118] border-b border-[#222]">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-400 w-12">Status</th>
              <th className="px-4 py-3 font-medium text-gray-400">Target URL</th>
              <th className="px-4 py-3 font-medium text-gray-400 w-32">Region</th>
              <th className="px-4 py-3 font-medium text-gray-400 w-40">ISP</th>
              <th className="px-4 py-3 font-medium text-gray-400 w-24 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {logs.map((log) => (
              <tr
                key={log.id}
                className={`transition-colors ${log.status === 'failed' ? 'hover:bg-red-500/10 cursor-pointer' : 'hover:bg-[#1a1a24]'}`}
                onClick={() => log.status === 'failed' && setSelectedLog(log)}
              >
                <td className="px-4 py-3">
                  {log.status === 'failed' && (
                    <span className="material-symbols-outlined text-red-500 text-lg block">
                      gpp_bad
                    </span>
                  )}
                  {log.status === 'success' && (
                    <span className="material-symbols-outlined text-green-500 text-lg block">
                      check_circle
                    </span>
                  )}
                  {log.status === 'running' && (
                    <span className="material-symbols-outlined text-blue-500 text-lg block animate-spin">
                      refresh
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 truncate max-w-[200px]" title={log.url}>
                  {log.url}
                </td>
                <td className="px-4 py-3 truncate">{log.networkInfo.region || 'Unknown'}</td>
                <td className="px-4 py-3 truncate" title={log.networkInfo.isp}>
                  {log.networkInfo.isp || 'Unknown'}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-600 italic">
                  No network logs recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DiagnosticsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  )
}
