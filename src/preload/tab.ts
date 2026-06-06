import { ipcRenderer } from 'electron'

const ethereum = {
  isMetaMask: true, // We spoof MetaMask for maximum dApp compatibility
  autoRefreshOnNetworkChange: false, // Prevents Uniswap from crashing on write
  request: async ({ method, params }: { method: string, params?: any[] }) => {
    switch (method) {
      case 'eth_requestAccounts':
        return await ipcRenderer.invoke('wallet:requestAccounts')
      case 'eth_accounts':
        try {
          const status = await ipcRenderer.invoke('wallet:status')
          return status.isUnlocked ? [status.address] : []
        } catch { return [] }
      case 'eth_sendTransaction':
        return await ipcRenderer.invoke('wallet:sendTransaction', params?.[0])
      case 'personal_sign':
        return await ipcRenderer.invoke('wallet:personalSign', params?.[0])
      case 'eth_chainId':
        return '0x1' // Default Mainnet for now
      default:
        // Forward all standard read queries (eth_call, eth_blockNumber, etc.) to a public node
        try {
          const response = await fetch('https://ethereum-rpc.publicnode.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method,
              params
            })
          })
          const data = await response.json()
          if (data.error) throw new Error(data.error.message)
          return data.result
        } catch (err) {
          console.warn(`[GhostWallet] RPC error for ${method}:`, err)
          throw err
        }
    }
  },
  on: (event: string, _callback: any) => {
    console.log(`[GhostWallet] Stubbed event listener for: ${event}`)
  },
  removeListener: () => {}
}

// Since contextIsolation is false for tabs, we can assign directly to the real window object
// and it will not be frozen by contextBridge!
// @ts-ignore
window.ethereum = ethereum

// Dispatch the standard event so dApps know the wallet is ready
window.dispatchEvent(new Event('ethereum#initialized'))
