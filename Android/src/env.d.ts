/// <reference types="vite/client" />

import { GhostAPI } from './types'

declare global {
  interface Window {
    api?: GhostAPI
  }
}
