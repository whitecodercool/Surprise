'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
const { execSync } = require('child_process')

const TOR_VERSION = '15.0.17'

// ── Platform detection ────────────────────────────────────────────────────────
const PLATFORM = process.env.TARGET_PLATFORM || process.platform // win32 | linux | darwin
const ARCH = process.env.TARGET_ARCH || process.arch // x64 | arm64

function getBundleName() {
  if (PLATFORM === 'win32') return `tor-expert-bundle-windows-x86_64-${TOR_VERSION}.tar.gz`
  if (PLATFORM === 'darwin')
    return `tor-expert-bundle-macos-${ARCH === 'arm64' ? 'aarch64' : 'x86_64'}-${TOR_VERSION}.tar.gz`
  // linux
  return `tor-expert-bundle-linux-${ARCH === 'arm64' ? 'aarch64' : 'x86_64'}-${TOR_VERSION}.tar.gz`
}

function getTorBinaryName() {
  return PLATFORM === 'win32' ? 'tor.exe' : 'tor'
}

const BUNDLE_NAME = getBundleName()
const DOWNLOAD_URL = `https://dist.torproject.org/torbrowser/${TOR_VERSION}/${BUNDLE_NAME}`
const TOR_BINARY = getTorBinaryName()

// SHA-256 of the .tar.gz — update this when you bump TOR_VERSION.
const EXPECTED_SHA256 = null

const OUT_DIR = path.join(__dirname, '..', 'resources', 'tor')
const ARCHIVE_PATH = path.join(__dirname, '..', 'resources', '_tor-bundle.tar.gz')

const KEEP_PATTERNS = [
  /^Tor\/tor\.exe$/i,
  /^Tor\/tor$/i,
  /^Tor\/.*\.dll$/i,
  /^Tor\/.*\.so(\.\d+)*$/i,
  /^Tor\/.*\.dylib$/i,
  /^Tor\/geoip$/i,
  /^Tor\/geoip6$/i
]

// ─────────────────────────────────────────────────────────────────────────────
function downloadWithCurl(url, dest) {
  console.log(`Downloading ${url}`)
  execSync(`curl -L --progress-bar -o "${dest}" "${url}"`, { stdio: 'inherit' })
}

function downloadWithNode(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}`)
    const file = fs.createWriteStream(dest)
    let received = 0
    let total = 0

    function get(u) {
      https
        .get(u, (res) => {
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
          file.on('finish', () => {
            file.close()
            console.log('')
            resolve()
          })
          file.on('error', reject)
          res.on('error', reject)
        })
        .on('error', (err) => reject(new Error(`Network error: ${err.message || err.code || err}`)))
    }

    get(url)
  })
}

function download(url, dest) {
  if (PLATFORM !== 'win32') {
    // curl is more reliable for TLS in WSL2/Linux/macOS
    downloadWithCurl(url, dest)
    return Promise.resolve()
  }
  return downloadWithNode(url, dest)
}

function verifySha256(filePath, expected) {
  if (!expected) {
    console.log('  Skipping SHA-256 check (EXPECTED_SHA256 not set)')
    return
  }
  console.log('Verifying SHA-256...')
  const data = fs.readFileSync(filePath)
  const actual = crypto.createHash('sha256').update(data).digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`SHA-256 mismatch!\n  expected: ${expected}\n  actual:   ${actual}`)
  }
  console.log('  SHA-256 OK')
}

function extractTarGz(archivePath, outDir) {
  console.log('Extracting...')
  fs.mkdirSync(outDir, { recursive: true })

  if (PLATFORM !== 'win32') {
    // Extract to a temp dir first, then find and copy what we need
    const tmpDir = outDir + '_tmp'
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: 'pipe' })

      // Find all files in the temp dir
      const allFiles = execSync(`find "${tmpDir}" -type f`)
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean)
      console.log('  Archive contains:')
      allFiles.forEach((f) => console.log(`    ${f.replace(tmpDir, '')}`))

      const wanted = [
        /\/tor(\.exe)?$/i,
        /\/.*\.dll$/i,
        /\/.*\.so(\.\d+)*$/i,
        /\/.*\.dylib$/i,
        /\/geoip$/i,
        /\/geoip6$/i
      ]

      for (const file of allFiles) {
        const rel = file.replace(tmpDir, '')
        if (wanted.some((p) => p.test(rel))) {
          const dst = path.join(outDir, path.basename(file))
          fs.copyFileSync(file, dst)
          console.log(`  + ${path.basename(file)}`)
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
    return Promise.resolve()
  }

  // Windows: use tar with strip-components.
  // Verify binary exists after each attempt — tar may exit 0 but extract nothing
  // if --strip-components exceeds the archive's actual path depth.
  for (const strip of ['2', '1', '0']) {
    try {
      execSync(`tar -xzf "${archivePath}" -C "${outDir}" --strip-components=${strip}`, {
        stdio: 'pipe'
      })
      if (fs.existsSync(path.join(outDir, TOR_BINARY))) {
        console.log(`  Extracted via system tar (--strip-components=${strip})`)
        return Promise.resolve()
      }
      // tar exited 0 but binary not present — clean partial output and try next level
      fs.readdirSync(outDir).forEach((f) => {
        try {
          fs.rmSync(path.join(outDir, f), { recursive: true, force: true })
        } catch {}
      })
    } catch {
      // tar failed — try next strip level
    }
  }

  // Windows manual extraction fallback
  const tarball = fs.createReadStream(archivePath).pipe(zlib.createGunzip())
  let buf = Buffer.alloc(0)
  let currentFile = null
  let currentSize = 0
  let bytesLeft = 0

  tarball.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 512) {
      if (bytesLeft > 0) {
        const take = Math.min(bytesLeft, buf.length)
        if (currentFile) currentFile.write(buf.subarray(0, take))
        buf = buf.subarray(take)
        bytesLeft -= take
        if (bytesLeft === 0 && currentFile) {
          currentFile.end()
          currentFile = null
          buf = buf.subarray((512 - (currentSize % 512)) % 512)
        }
        continue
      }
      if (buf.length < 512) break
      const header = buf.subarray(0, 512)
      buf = buf.subarray(512)
      const name = header.subarray(0, 100).toString('utf8').replace(/\0+$/, '')
      const size = parseInt(header.subarray(124, 136).toString('utf8').trim(), 8) || 0
      const type = String.fromCharCode(header[156])
      if (!name) continue
      const keep = KEEP_PATTERNS.some((re) => re.test(name))
      const destPath = path.join(outDir, path.basename(name))
      if ((type === '0' || type === '') && keep && size > 0) {
        console.log(`  + ${path.basename(name)}`)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        currentFile = fs.createWriteStream(destPath)
        currentSize = size
        bytesLeft = size
      } else {
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
  console.log(`Version:  ${TOR_VERSION}`)
  console.log(`Platform: ${PLATFORM} / ${ARCH}`)
  console.log(`Bundle:   ${BUNDLE_NAME}`)
  console.log(`Output:   resources/tor/\n`)

  const metadataPath = path.join(OUT_DIR, '.metadata.json')
  let currentMetadata = null
  try {
    if (fs.existsSync(metadataPath)) {
      currentMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    }
  } catch (e) {}

  const targetMetadata = { platform: PLATFORM, arch: ARCH, version: TOR_VERSION }

  if (
    !currentMetadata ||
    currentMetadata.platform !== PLATFORM ||
    currentMetadata.arch !== ARCH ||
    currentMetadata.version !== TOR_VERSION
  ) {
    console.log(`Target metadata mismatch or missing (Current: ${JSON.stringify(currentMetadata)}, Target: ${JSON.stringify(targetMetadata)}). Cleaning resources/tor/...`)
    try {
      fs.rmSync(OUT_DIR, { recursive: true, force: true })
    } catch (e) {}
  }

  const torBin = path.join(OUT_DIR, TOR_BINARY)
  if (fs.existsSync(torBin)) {
    console.log(`${TOR_BINARY} already exists in resources/tor/ — nothing to do.`)
    console.log('Delete resources/tor/ and re-run to re-download.\n')
    return
  }

  fs.mkdirSync(path.dirname(ARCHIVE_PATH), { recursive: true })

  await download(DOWNLOAD_URL, ARCHIVE_PATH)
  verifySha256(ARCHIVE_PATH, EXPECTED_SHA256)
  await extractTarGz(ARCHIVE_PATH, OUT_DIR)

  fs.unlinkSync(ARCHIVE_PATH)

  // Make the binary executable on Unix
  if (PLATFORM !== 'win32' && fs.existsSync(torBin)) {
    fs.chmodSync(torBin, 0o755)
    console.log(`  chmod +x ${TOR_BINARY}`)
  }

  const files = fs.readdirSync(OUT_DIR)
  console.log('\nFiles in resources/tor/:')
  files.forEach((f) => console.log(`  ${f}`))

  if (!fs.existsSync(torBin)) {
    console.error(`\nERROR: ${TOR_BINARY} not found after extraction.`)
    console.error('The bundle layout may have changed. Inspect the archive manually.')
    process.exit(1)
  }

  fs.writeFileSync(metadataPath, JSON.stringify(targetMetadata, null, 2))
  console.log(`\nDone.\n`)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
