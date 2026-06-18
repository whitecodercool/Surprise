import { type ReactNode } from 'react'

interface NavButtonProps {
  onClick: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
  className?: string
}

export default function NavButton({
  onClick,
  disabled = false,
  title,
  children,
  className = ''
}: NavButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`nav-btn ${className}`}>
      {children}
    </button>
  )
}
