import { useState } from 'react'
import type { TaskLogEntry } from '../../../../shared/types/Diagnostics'
import { motion, AnimatePresence } from 'framer-motion'

interface DiagnosticsModalProps {
  log: TaskLogEntry | null
  onClose: () => void
}

export function DiagnosticsModal({ log, onClose }: DiagnosticsModalProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'curl' | 'tls' | 'payload'>('timeline')

  if (!log || !log.failureDiagnostics) return null

  const env = log.failureDiagnostics

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          className="w-full max-w-2xl bg-[#111118] border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#222] bg-[#0a0a0f]">
            <div>
              <h2 className="text-lg font-semibold text-red-500 flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">gpp_bad</span>
                Diagnostic Envelope
              </h2>
              <div className="text-xs text-gray-500 font-mono mt-1">{log.url}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#222] text-gray-400 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-4 pt-2 border-b border-[#222] bg-[#0a0a0f] overflow-x-auto no-scrollbar">
            {[
              { id: 'timeline', label: 'Timeline', icon: 'timeline' },
              { id: 'curl', label: 'cURL', icon: 'terminal' },
              { id: 'tls', label: 'TLS State', icon: 'lock' },
              { id: 'payload', label: 'Payload', icon: 'data_object' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh] text-sm text-gray-300">
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Connection Sequence
                </h3>
                <div className="relative pl-6 space-y-6">
                  {/* Vertical line */}
                  <div className="absolute left-2.5 top-2 bottom-2 w-px bg-[#333]"></div>

                  <TimelineStep
                    name="DNS Resolution"
                    ms={env.timeline.dnsMs}
                    status={env.timeline.failedAtStep === 'DNS' ? 'failed' : 'success'}
                  />
                  <TimelineStep
                    name="TCP Handshake"
                    ms={env.timeline.tcpMs}
                    status={
                      env.timeline.failedAtStep === 'TCP'
                        ? 'failed'
                        : env.timeline.failedAtStep === 'DNS'
                          ? 'pending'
                          : 'success'
                    }
                  />
                  <TimelineStep
                    name="TLS Handshake"
                    ms={env.timeline.tlsMs}
                    status={
                      env.timeline.failedAtStep === 'TLS'
                        ? 'failed'
                        : ['DNS', 'TCP'].includes(env.timeline.failedAtStep)
                          ? 'pending'
                          : 'success'
                    }
                  />
                  <TimelineStep
                    name="HTTP Request"
                    ms={env.timeline.httpMs}
                    status={
                      env.timeline.failedAtStep === 'HTTP'
                        ? 'failed'
                        : ['DNS', 'TCP', 'TLS'].includes(env.timeline.failedAtStep)
                          ? 'pending'
                          : 'success'
                    }
                  />
                </div>
              </div>
            )}

            {activeTab === 'curl' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                    Reproduction Command
                  </h3>
                  <button
                    onClick={() => navigator.clipboard.writeText(env.reproductionCurl)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span> Copy
                  </button>
                </div>
                <div className="bg-[#0a0a0f] border border-[#222] rounded-lg p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap text-blue-300">
                  {env.reproductionCurl}
                </div>
              </div>
            )}

            {activeTab === 'tls' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    JA3 Fingerprint
                  </h3>
                  <div className="bg-[#0a0a0f] border border-[#222] rounded-lg p-3 font-mono text-xs break-all text-purple-400">
                    {env.tlsState.ja3Fingerprint || 'N/A'}
                  </div>
                </div>
                <div>
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Cipher Suite
                  </h3>
                  <div className="bg-[#0a0a0f] border border-[#222] rounded-lg p-3 font-mono text-xs text-green-400">
                    {env.tlsState.cipherSuiteUsed || 'N/A'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-[#1a1a24] p-3 rounded-lg border border-[#333]">
                    <div className="text-xs text-gray-500 mb-1">Active Proxy</div>
                    <div className="font-mono text-sm">{env.appState.activeProxy}</div>
                  </div>
                  <div className="bg-[#1a1a24] p-3 rounded-lg border border-[#333]">
                    <div className="text-xs text-gray-500 mb-1">User-Agent Engine</div>
                    <div className="font-mono text-sm">{env.appState.userAgentInjected}</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'payload' && (
              <div className="space-y-4">
                <div className="bg-[#1a1a24] border border-[#333] rounded-lg p-4">
                  <div className="text-xs text-red-400 font-semibold mb-1">
                    Error Type: {env.errorType}
                  </div>
                  <div className="text-sm">{env.errorMessage}</div>
                </div>

                <div>
                  <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Response Dump
                  </h3>
                  <div className="bg-[#0a0a0f] border border-[#222] rounded-lg p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap text-orange-300">
                    {env.responseDump.bodySnippet || 'No response body captured.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function TimelineStep({
  name,
  ms,
  status
}: {
  name: string
  ms: number | null
  status: 'success' | 'failed' | 'pending'
}) {
  return (
    <div className="relative flex items-center gap-4">
      {/* Icon Node */}
      <div
        className={`absolute -left-3.5 w-7 h-7 rounded-full border-4 border-[#111118] flex items-center justify-center
        ${status === 'success' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-[#333]'}
      `}
      >
        <span className="material-symbols-outlined text-[14px] text-white font-bold">
          {status === 'success' ? 'check' : status === 'failed' ? 'close' : 'remove'}
        </span>
      </div>

      <div className="flex-1 flex justify-between items-center ml-4 bg-[#1a1a24] border border-[#222] p-3 rounded-lg">
        <span className={status === 'pending' ? 'text-gray-500' : 'text-gray-200'}>{name}</span>
        {status !== 'pending' && ms !== null && (
          <span className="text-xs font-mono text-gray-500">{ms}ms</span>
        )}
      </div>
    </div>
  )
}
