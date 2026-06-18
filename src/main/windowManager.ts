import { BaseWindow } from 'electron'

export class WindowManager {
  private sidebarWidth = 0

  constructor(private window: BaseWindow) {}

  getSidebarWidth(): number {
    return this.sidebarWidth
  }

  setSidebarWidth(width: number): void {
    this.sidebarWidth = Math.max(0, Math.min(width, 400))
  }

  getContentBounds(): { x: number; y: number; width: number; height: number } {
    const bounds = this.window.getContentBounds()
    const toolbarHeight = 88

    return {
      x: this.sidebarWidth,
      y: toolbarHeight,
      width: bounds.width - this.sidebarWidth,
      height: bounds.height - toolbarHeight
    }
  }

  handleResize(): void {
    // The tab manager will reposition tabs on resize via positionTabs
    // This is called from the main index.ts after UI view is resized
  }
}
