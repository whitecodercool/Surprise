/**
 * scripts/download-tor.js
 *
 * Downloads the official Tor Expert Bundle for Windows x64,
 * verifies the SHA-256 checksum, and extracts tor.exe + required DLLs
 * into resources/tor/ so electron-builder packs them with the app.
 *
 * Run once before building:
 *   node scripts/download-tor.js
 */

'use strict'

const https     = require('https')
const fs        = require('fs')
const path      = require('path')
const crypto    = require('crypto')
const zlib      = require('zlib')
const { execSync } = require('child_process')

// ── Tor Expert Bundle — Windows x64 ──────────────────────────────────────────
// Check https://www.torproject.org/download/tor/ for the latest version.
const TOR_VERSION  = '15.0.15'
const BUNDLE_NAME  = `tor-expert-bundle-windows-x86_64-${TOR_VERSION}.tar.gz`
const DOWNLOAD_URL = `https://dist.torproject.org/torbrowser/${TOR_VERSION}/${BUNDLE_NAME}`

// SHA-256 of the .tar.gz — update this when you bump TOR_VERSION.
// Obtain from: https://www.torproject.org/download/tor/  (SHA256SUMS file)
const EXPECTED_SHA256 = null  // set to the hex string from SHA256SUMS, or leave null to skip

const OUT_DIR      = path.join(__dirname, '..', 'resources', 'tor')
const ARCHIVE_PATH = path.join(__dirname, '..', 'resources', '_tor-bundle.tar.gz')

// Files we want from the archive (everything in the Tor/ subdirectory)
const KEEP_PATTERNS = [
  /^Tor\/tor\.exe$/i,
  /^Tor\/.*\.dll$/i,
  /^Tor\/.*\.so$/i,          // future Linux support
  /^Tor\/geoip$/i,
  /^Tor\/geoip6$/i,
]

// ─────────────────────────────────────────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}`)
    const file   = fs.createWriteStream(dest)
    let received = 0
    let total    = 0

    function get(u) {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        total = parseInt(res.headers['content-length'] || '0', 10)
        res.on('data', (chunk) => {
          received += chunk.length
          if (total) {
            const pct = Math.round((received / total) * 100)
            process.stdout.write(`\r  ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`)
          }
        })
        res.pipe(file)
        file.on('finish', () => { file.close(); console.log(''); resolve() })
        file.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }

    get(url)
  })
}

function verifySha256(filePath, expected) {
  if (!expected) { console.log('  Skipping SHA-256 check (EXPECTED_SHA256 not set)'); return }
  console.log('Verifying SHA-256...')
  const data   = fs.readFileSync(filePath)
  const actual = crypto.createHash('sha256').update(data).digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`SHA-256 mismatch!\n  expected: ${expected}\n  actual:   ${actual}`)
  }
  console.log('  SHA-256 OK')
}

function extractTarGz(archivePath, outDir) {
  console.log('Extracting...')
  fs.mkdirSync(outDir, { recursive: true })

  // Use tar command (available on Windows 10+ and all Unix).
  // The bundle extracts as: tor/tor/tor.exe — strip 2 levels to put tor.exe directly in outDir.
  for (const strip of ['2', '1', '0']) {
    try {
      execSync(`tar -xzf "${archivePath}" -C "${outDir}" --strip-components=${strip}`, { stdio: 'pipe' })
      console.log(`  Extracted via system tar (--strip-components=${strip})`)
      return
    } catch {
      // Try next strip level
    }
  }

  // Manual extraction using Node streams (no external tar required)
  const { pipeline } = require('stream')
  const tarball = fs.createReadStream(archivePath).pipe(zlib.createGunzip())

  let buf = Buffer.alloc(0)
  let currentFile = null
  let currentSize = 0
  let bytesLeft   = 0

  tarball.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])

    while (buf.length >= 512) {
      if (bytesLeft > 0) {
        // Writing file content
        const take = Math.min(bytesLeft, buf.length)
        if (currentFile) currentFile.write(buf.slice(0, take))
        buf = buf.slice(take)
        bytesLeft -= take
        if (bytesLeft === 0 && currentFile) {
          currentFile.end()
          currentFile = null
          // Skip padding (blocks of 512)
          const pad = (512 - (currentSize % 512)) % 512
          buf = buf.slice(pad)
        }
        continue
      }

      if (buf.length < 512) break

      const header  = buf.slice(0, 512)
      buf = buf.slice(512)

      const name = header.slice(0, 100).toString('utf8').replace(/\0+$/, '')
      const size = parseInt(header.slice(124, 136).toString('utf8').trim(), 8) || 0
      const type = String.fromCharCode(header[156])  // '0'=file, '5'=dir, ''=file

      if (!name) continue  // end-of-archive block

      const keep = KEEP_PATTERNS.some(re => re.test(name))
      const destPath = path.join(outDir, path.basename(name))

      if (type === '5' || type === '\0') {
        // Directory
      } else if ((type === '0' || type === '') && keep && size > 0) {
        console.log(`  + ${path.basename(name)}`)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        currentFile = fs.createWriteStream(destPath)
        currentSize = size
        bytesLeft   = size
      } else {
        // Skip this entry
        bytesLeft = size
      }
    }
  })

  return new Promise((resolve, reject) => {
    tarball.on('end', resolve)
    tarball.on('error', reject)
  })
}

async function main() {
  console.log(`\n=== Tor Expert Bundle downloader ===`)
  console.log(`Version: ${TOR_VERSION}`)
  console.log(`Output:  resources/tor/\n`)

  // Already done?
  const torExe = path.join(OUT_DIR, 'tor.exe')
  if (fs.existsSync(torExe)) {
    console.log('tor.exe already exists in resources/tor/ — nothing to do.')
    console.log('Delete resources/tor/ and re-run to re-download.\n')
    return
  }

  fs.mkdirSync(path.dirname(ARCHIVE_PATH), { recursive: true })

  await download(DOWNLOAD_URL, ARCHIVE_PATH)
  verifySha256(ARCHIVE_PATH, EXPECTED_SHA256)
  await extractTarGz(ARCHIVE_PATH, OUT_DIR)

  // Clean up the archive
  fs.unlinkSync(ARCHIVE_PATH)

  // List what we got
  const files = fs.readdirSync(OUT_DIR)
  console.log('\nFiles in resources/tor/:')
  files.forEach(f => console.log(`  ${f}`))

  if (!fs.existsSync(torExe)) {
    console.error('\nERROR: tor.exe not found after extraction.')
    console.error('The bundle layout may have changed. Inspect the archive manually.')
    process.exit(1)
  }

  console.log('\nDone. Run `npm run build:win` to package the app with Tor bundled.\n')
}

main().catch(err => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
