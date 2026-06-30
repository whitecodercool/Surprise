import { useEffect, useState } from 'react'

export default function UpdaterOverlay() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes: string } | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    api.onUpdaterAvailable((info: { version: string; releaseNotes: string }) => {
      setUpdateInfo({
        version: info.version,
        notes: info.releaseNotes || 'Security enhancements and performance optimizations.'
      })
    })

    api.onUpdaterProgress((data: { percent: number }) => {
      setProgress(Math.round(data.percent))
    })

    api.onUpdaterDownloaded(() => {
      setProgress(100)
    })

    api.onUpdaterError((errMsg: string) => {
      setError(errMsg)
    })
  }, [])

  if (!updateInfo) return null

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center select-none"
      style={{
        background: 'rgba(5, 5, 5, 0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}
    >
      <div
        className="flex flex-col items-center max-w-md w-full px-8 text-center animate-fade-in"
        style={{ animationDuration: '0.4s' }}
      >
        {/* Holographic Logo Mark */}
        <div className="mb-6 animate-pulse" style={{ animationDuration: '3s' }}>
          <svg width="56" height="36" viewBox="0 0 28 18" fill="none">
            <path
              d="M1 9s5-7 13-7 13 7 13 7-5 7-13 7S1 9 1 9z"
              stroke="var(--color-accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="14" cy="9" r="4.2" fill="var(--color-accent)" />
          </svg>
        </div>

        <h2
          className="font-bold tracking-wider mb-2"
          style={{
            fontSize: 18,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.12em'
          }}
        >
          CRITICAL UPDATE REQUIRED
        </h2>
        <p className="mb-6" style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          A mandatory security patch is available (v{updateInfo.version}). Updates are compulsory to maintain access to Ghost Browser.
        </p>

        {/* Release Notes Box */}
        <div
          className="w-full rounded-lg p-4 mb-6 text-left"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            maxHeight: 120,
            overflowY: 'auto'
          }}
        >
          <div
            className="font-bold mb-1.5"
            style={{
              fontSize: 11,
              color: 'var(--color-text-primary)',
              letterSpacing: '0.04em'
            }}
          >
            UPDATE FEATURES:
          </div>
          <div
            style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}
            dangerouslySetInnerHTML={{ __html: updateInfo.notes }}
          />
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-1 rounded-full overflow-hidden mb-3"
          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(to right, var(--color-accent), #ff5566)',
              boxShadow: '0 0 10px var(--color-accent)'
            }}
          />
        </div>

        <div className="font-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {progress < 100 ? `Downloading updates: ${progress}%` : 'Finalizing installation...'}
        </div>

        {error && (
          <div
            className="mt-6 w-full text-left p-3.5 rounded-lg"
            style={{
              background: 'rgba(230, 57, 70, 0.05)',
              border: '1px solid rgba(230, 57, 70, 0.15)',
              fontSize: 11,
              color: 'var(--color-accent)',
              lineHeight: 1.4
            }}
          >
            <div className="font-bold mb-1">Update Error:</div>
            <div>{error}</div>
          </div>
        )}
      </div>
    </div>
  )
}
