import { useState, useRef, useCallback } from 'react'
import type { Tab } from '../../types'

interface SidebarTabProps {
  tab: Tab
  isActive: boolean
  index: number
  onSelect: () => void
  onClose: () => void
  onPin: () => void
  onMute: () => void
  onDragStart: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
}

export default function SidebarTab({
  tab,
  isActive,
  onSelect,
  onClose,
  onPin,
  onMute,
  onDragStart,
  onDrop,
  onDragOver
}: SidebarTabProps) {
  const [closing, setClosing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const tabRef = useRef<HTMLDivElement>(null)

  const displayTitle = tab.title || 'New Tab'

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setClosing(true)
      // Wait for CSS animation to complete before actually closing
      setTimeout(() => onClose(), 220)
    },
    [onClose]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true)
      onDragStart(e)
      // Set a minimal drag image
      const el = tabRef.current
      if (el) {
        e.dataTransfer.setDragImage(el, 10, 10)
      }
    },
    [onDragStart]
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDragOverLocal = useCallback(
    (e: React.DragEvent) => {
      onDragOver(e)
      const rect = tabRef.current?.getBoundingClientRect()
      if (rect) {
        const midY = rect.top + rect.height / 2
        setDropPosition(e.clientY < midY ? 'above' : 'below')
      }
    },
    [onDragOver]
  )

  const handleDragLeave = useCallback(() => {
    setDropPosition(null)
  }, [])

  const handleDropLocal = useCallback(
    (e: React.DragEvent) => {
      setDropPosition(null)
      onDrop(e)
    },
    [onDrop]
  )

  // Build CSS classes
  const classes = [
    'no-drag sidebar-tab flex items-center gap-2 px-2.5 py-[7px] rounded-[9px] cursor-default group',
    isActive ? 'active' : '',
    tab.isPinned ? 'pinned' : '',
    closing ? 'closing' : 'animate-tab-add',
    isDragging ? 'dragging' : '',
    dropPosition === 'above' ? 'drop-above' : '',
    dropPosition === 'below' ? 'drop-below' : '',
    (tab as any).isSuspended ? 'opacity-50 grayscale transition-all hover:opacity-80' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={tabRef}
      draggable={!closing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDrop={handleDropLocal}
      onDragOver={handleDragOverLocal}
      onDragLeave={handleDragLeave}
      onClick={onSelect}
      className={classes}
    >
      {/* Favicon / Loading */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 16, height: 16 }}
      >
        {tab.isLoading ? (
          <div
            className="animate-spin"
            style={{
              width: 13,
              height: 13,
              border: '1.5px solid var(--color-text-faint)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%'
            }}
          />
        ) : tab.favicon ? (
          <img
            src={tab.favicon}
            alt=""
            style={{ width: 15, height: 15, borderRadius: 4, objectFit: 'cover' }}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect
              x="1.5"
              y="1.5"
              width="12"
              height="12"
              rx="3"
              stroke="var(--color-text-faint)"
              strokeWidth="1"
            />
            <circle cx="7.5" cy="7.5" r="2" fill="var(--color-text-faint)" />
          </svg>
        )}
      </div>

      {/* Title */}
      <span
        className="tab-title flex-1 truncate"
        style={{
          fontSize: 12,
          fontWeight: isActive ? 500 : 400,
          color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          lineHeight: 1.3
        }}
      >
        {displayTitle}
      </span>

      {/* Suspended indicator */}
      {(tab as any).isSuspended && !tab.isMuted && (
        <svg
          className="ml-1 text-[var(--color-text-faint)]"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M2 4v16M22 4v16M12 4v16M6 4l6 16M18 4l-6 16"></path>
        </svg>
      )}

      {/* Muted indicator (always visible when muted) */}
      {tab.isMuted && (
        <svg className="mute-indicator" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 4.5h1.5L6 2.5v7l-2.5-2H2a.5.5 0 01-.5-.5V5a.5.5 0 01.5-.5z"
            fill="currentColor"
          />
          <path
            d="M8 4.5l3 3M11 4.5l-3 3"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Action buttons */}
      <div className="tab-actions">
        {/* Mute/unmute */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMute()
          }}
          className="tab-action-btn"
          title={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
        >
          {tab.isMuted ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 4.5h1.5L6 2.5v7l-2.5-2H2a.5.5 0 01-.5-.5V5a.5.5 0 01.5-.5z"
                fill="currentColor"
              />
              <path
                d="M8 4.5l3 3M11 4.5l-3 3"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 4.5h1.5L6 2.5v7l-2.5-2H2a.5.5 0 01-.5-.5V5a.5.5 0 01.5-.5z"
                fill="currentColor"
              />
              <path
                d="M8.5 4.5a2.5 2.5 0 010 3"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        {/* Pin/unpin */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPin()
          }}
          className="tab-action-btn"
          title={tab.isPinned ? 'Unpin tab' : 'Pin tab'}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M6.5 1l3.5 3.5-2 2-.8-.8-2.5 2.5L3 6.5l2.5-2.5-.8-.8z"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
              fill={tab.isPinned ? 'currentColor' : 'none'}
            />
            <path
              d="M4.2 7.8L1.5 10.5"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Close */}
        <button onClick={handleClose} className="tab-action-btn close-btn" title="Close tab">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2.5 2.5l5 5M7.5 2.5l-5 5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Hover preview tooltip */}
      {!isActive && !closing && !isDragging && tab.url && (
        <div
          className="tab-preview"
          style={{
            top: tabRef.current ? tabRef.current.getBoundingClientRect().top : 0,
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-medium)',
            borderRadius: 10,
            padding: '8px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            maxWidth: 280
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              marginBottom: 2
            }}
          >
            {displayTitle}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.url}
          </div>
        </div>
      )}
    </div>
  )
}
