import { useBrowser } from '../../context/BrowserContext'

export default function KebabMenu() {
  const { state } = useBrowser()
  const currentTheme = state.uiSettings.theme || 'system'

  return (
    <button
      onClick={() => window.api?.showKebabMenu(currentTheme)}
      className="kebab-menu-btn"
      title="Menu"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="3.5" r="1.2" fill="currentColor" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
      </svg>
    </button>
  )
}
