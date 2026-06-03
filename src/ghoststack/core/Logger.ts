/**
 * GhostStack Persistent Logger
 *
 * Writes structured logs to rotating files inside the Electron userData directory.
 *   %APPDATA%/flux-browser/logs/ghost-<date>.log
 *
 * Features:
 *   • Timestamped entries with log level
 *   • Auto-rotation: one file per day, old files pruned after MAX_LOG_FILES days
 *   • Tee to console — everything still appears in the terminal
 *   • Global monkey-patch for console.log/warn/error so every existing
 *     console.log() call in the codebase is automatically persisted
 *   • Lazy file-handle: opens the file on first write, reopens on date change
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// ── Configuration ──
const MAX_LOG_FILES = 7          // Keep at most 7 days of logs
const LOG_DIR_NAME = 'logs'
const LOG_PREFIX = 'ghost'

// ── Internal state ──
let logDir: string | null = null
let currentLogDate: string | null = null
let writeStream: fs.WriteStream | null = null
let initialized = false

// Keep references to the original console methods
const _origLog = console.log.bind(console)
const _origWarn = console.warn.bind(console)
const _origError = console.error.bind(console)
const _origInfo = console.info.bind(console)
const _origDebug = console.debug.bind(console)

// ── Helpers ──

function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timestamp(): string {
  return new Date().toISOString()
}

function ensureLogDir(): string {
  if (logDir) return logDir
  const userData = app.getPath('userData')
  logDir = path.join(userData, LOG_DIR_NAME)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

function getStream(): fs.WriteStream {
  const today = todayString()

  // Reuse existing stream if same day
  if (writeStream && currentLogDate === today) {
    return writeStream
  }

  // Close old stream
  if (writeStream) {
    writeStream.end()
    writeStream = null
  }

  const dir = ensureLogDir()
  const filePath = path.join(dir, `${LOG_PREFIX}-${today}.log`)
  writeStream = fs.createWriteStream(filePath, { flags: 'a' })
  currentLogDate = today

  // Prune old log files
  pruneOldLogs(dir)

  return writeStream
}

function pruneOldLogs(dir: string): void {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(LOG_PREFIX) && f.endsWith('.log'))
      .sort()

    while (files.length > MAX_LOG_FILES) {
      const oldest = files.shift()!
      fs.unlinkSync(path.join(dir, oldest))
    }
  } catch {
    // Non-critical — ignore
  }
}

function formatArgs(args: any[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  }).join(' ')
}

function writeLine(level: string, args: any[]): void {
  try {
    const stream = getStream()
    const line = `[${timestamp()}] [${level}] ${formatArgs(args)}\n`
    stream.write(line)
  } catch {
    // Never crash the app because of logging
  }
}

// ── Public API ──

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

/**
 * Initialise the persistent logger.
 * Call once from main/index.ts before any other code runs.
 * This monkey-patches console.log/warn/error so ALL existing
 * log calls are automatically persisted to disk.
 */
export function initLogger(): void {
  if (initialized) return
  initialized = true

  // Monkey-patch console so every console.log call is persisted
  console.log = (...args: any[]) => {
    _origLog(...args)
    writeLine('INFO', args)
  }

  console.info = (...args: any[]) => {
    _origInfo(...args)
    writeLine('INFO', args)
  }

  console.warn = (...args: any[]) => {
    _origWarn(...args)
    writeLine('WARN', args)
  }

  console.error = (...args: any[]) => {
    _origError(...args)
    writeLine('ERROR', args)
  }

  console.debug = (...args: any[]) => {
    _origDebug(...args)
    writeLine('DEBUG', args)
  }

  // Catch unhandled errors
  process.on('uncaughtException', (err) => {
    writeLine('ERROR', [`[UncaughtException] ${err.stack || err.message}`])
    _origError('[UncaughtException]', err)
  })

  process.on('unhandledRejection', (reason) => {
    writeLine('ERROR', [`[UnhandledRejection] ${reason}`])
    _origError('[UnhandledRejection]', reason)
  })

  console.log(`[Logger] Persistent logging initialised → ${ensureLogDir()}`)
}

/**
 * Returns the absolute path to the current log file.
 */
export function getLogFilePath(): string {
  return path.join(ensureLogDir(), `${LOG_PREFIX}-${todayString()}.log`)
}

/**
 * Returns the directory containing all log files.
 */
export function getLogDirectory(): string {
  return ensureLogDir()
}

/**
 * Flush and close the current write stream (call on app quit).
 */
export function closeLogger(): void {
  if (writeStream) {
    writeStream.end()
    writeStream = null
  }
}
