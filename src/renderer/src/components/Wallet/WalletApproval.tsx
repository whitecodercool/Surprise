import React, { useEffect, useState } from 'react'

interface TxParams {
  to?: string
  value?: string
  data?: string
}

interface PromptData {
  type: 'transaction' | 'personalSign' | 'requestAccounts'
  url: string
  txParams?: TxParams
  message?: string
}

export const WalletApproval: React.FC = () => {
  const [prompt, setPrompt] = useState<PromptData | null>(null)

  useEffect(() => {
    // Listen for wallet prompts from the main process
    // @ts-ignore
    if (window.api && window.api.onWalletPrompt) {
      // @ts-ignore
      window.api.onWalletPrompt((data: PromptData) => {
        setPrompt(data)
      })
    }
  }, [])

  if (!prompt) return null

  const handleApprove = () => {
    // @ts-ignore
    window.api.respondWalletPrompt(true)
    setPrompt(null)
  }

  const handleReject = () => {
    // @ts-ignore
    window.api.respondWalletPrompt(false)
    setPrompt(null)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md">
      <div className="bg-[#1a1a1a]/80 border border-white/10 p-6 rounded-2xl shadow-2xl backdrop-blur-xl w-[400px] text-white font-sans animate-in fade-in zoom-in duration-200">
        
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-wide">Ghost Wallet</h2>
            <p className="text-xs text-white/50">{prompt.url}</p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-black/50 rounded-xl border border-white/5">
          {prompt.type === 'transaction' && (
            <>
              <div className="text-sm text-white/60 mb-1">Contract Interaction</div>
              <div className="text-xs font-mono text-white/80 break-all mb-3">{prompt.txParams?.to || 'Contract Creation'}</div>
              
              <div className="text-sm text-white/60 mb-1">Value</div>
              <div className="text-lg font-bold text-white mb-3">
                {prompt.txParams?.value ? (parseInt(prompt.txParams.value, 16) / 1e18).toFixed(4) : '0'} ETH
              </div>

              <div className="text-xs text-red-400 mt-2 flex items-start">
                <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                Warning: Always verify the contract address.
              </div>
            </>
          )}

          {prompt.type === 'requestAccounts' && (
            <>
              <div className="text-sm text-white/60 mb-1">Connection Request</div>
              <div className="text-xs font-mono text-white/80 break-words mb-3">
                This website is requesting to view your public Ghost Wallet address and balance.
              </div>
              <div className="text-xs text-blue-400 mt-2 flex items-start">
                <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                Approving this does not grant the site permission to spend your funds.
              </div>
            </>
          )}

          {prompt.type === 'personalSign' && (
            <>
              <div className="text-sm text-white/60 mb-1">Signature Request</div>
              <div className="text-xs font-mono text-white/80 break-words max-h-32 overflow-y-auto bg-black/30 p-2 rounded">
                {prompt.message}
              </div>
            </>
          )}
        </div>

        <div className="flex space-x-3">
          <button 
            onClick={handleReject}
            className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-all"
          >
            Reject
          </button>
          <button 
            onClick={handleApprove}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all"
          >
            Approve
          </button>
        </div>

      </div>
    </div>
  )
}
