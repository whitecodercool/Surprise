import { GhostAPI } from '../renderer/src/types'

declare global {
  interface Window {
    api: GhostAPI
  }
}
