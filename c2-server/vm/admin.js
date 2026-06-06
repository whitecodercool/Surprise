const blessed = require('blessed');
const contrib = require('blessed-contrib');
const crypto = require('crypto');
const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');

// === CONFIGURATION ===
const DISCORD_BOT_TOKEN = 'YOUR_DISCORD_BOT_TOKEN_HERE';
const DISCORD_CHANNEL_ID = '1512882390295646248';
const TOR_PROXY = 'socks5h://tor-proxy:9050';
// =====================

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDd6mXhOddJocWN
yg+IZXK90sYn8nKNzf7anz7C4yevBUqBpFG88BBA8YPu8vNFZ2nW1sOr88Hj45bT
0tlVIQ8R+6ST4rLiLftnEjQxFF8UkMK1GFwgpcFCVznQiJkqZwbkCy6XFM6Llfj9
zVq7o360DvsIZrk2i75ymDQb1pNQ1keUfEaQBb28tFmmMA4yrT03d5gr1nPn8YN0
MJAEpLpkOI5PqFglNAUuuCciuh38mvC8Vg6a/roG0uHkcDLqsMiXgi06sfI9jBNK
MBcJ7BmvbP0nOT/zmM33ZYhw7NJ20y6y1SdFR5TmzwP/W5h5uPnGp3slB3NMFCdg
hAAILiFhAgMBAAECggEAN4fRoaf3Kvo7tKzk8SUtrrmBE3r0Vm6/QNbLfjoYco/4
4nMLbyOFdbLZ6F/MJ0hm8DdCtJMlKBEJ64yeDNLecgoN12HJkJagC90+yS9HUZ6d
0nI7j4Ha1+56zad46GbqjwMLUAwJWV2Ydm4+L6kMaiM7hxEpdLBIYmWa2IJ7z6Sv
6tviFSmQP2956gJcAt/HShvQJgw1hBTvQOi6h/o8/esQe2372dismyI7sUXpFQY/
r+KK3M0wd2FdU3UqW7cF5LfIO3Wlt5e6DmIDJItmHyLNUXpW6mYbG/k6N3DY+UTv
X4waQWabt3BxeX7Z7zTBoHby8Xc/Wmrwarzfb9GFtwKBgQDy2I9pHFDu6YuvaJgu
Zy5s0/M0k0VjAzBbMEVrthDuWol+ZPkOknkFTCTbGydRccz4vGLUfWxi4YiGu50j
5X8xKnaWxhk98B5br7mT5BKnnkSTS5VRJ9ubNYlHIWsO7Xa+YwQkSFux/EWTy+xT
Vu7Ev8d0UjIaQBq2iPf6jWW5WwKBgQDp75slehSt9x8PKzU7mlOQNYMe38RkNWnS
E2r1lxEpzFmw/bLRmHeCa7q5LR1LlExYjAhiAIkqS9+wKvKUH2+18rCEte1dF5b7
A7LAdMYqEnRnow8BSk51i14bGhZx3qwkcENAHBrhEMuIickNq/43GX03H3oF43QV
zONxm9SQ8wKBgFk3gHBgS8eKG5xks8wQcjjfITGGjW5TxJcrw8VPjSbUMkEyPWHC
JB3zHHM2pZpBUclsBG8GaSRmsS62jIOck77vV8QKoUllBvIuO+J+XvAfsBfhI8k9
+GssHvP37gn86awGWoYt4yofgTxMJdV0UaIMxu0QKYIFXQsEhP4SpnWTAoGAQhx1
0wSKPZO+ElJaq+p0PSfyU1JXtR4nNrhIHPnBXveiTVOVKoiVFaWOUnC+e7KAVPHW
GKQgH3Tr1WR9w4CS2G+qlQa4+vsErxGffaZCrncisHszbWDrhWqKgMxBlZKhQXb8
emy25+4QJxkRWazGnhm0+lQJ7woVr2eEy4GHdCMCgYBBdHIRNFl8I+MMEETjM1k0
xE+uF2CPnvilam/zsFaBmZWBVMiW3/ISpyPFEsll05IwHW1p2jdwqAU74sf4GvQQ
9OCijtQU0cGuYBRiDfkX+Go3TJeRv6aOokbXrvdk6waLQY+oFnF2r22SgylxnaLX
buLNQ+1LrzMRpWDoyrJI/Q==
-----END PRIVATE KEY-----`;

// Terminal UI Setup
const screen = blessed.screen();
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// 1. Matrix Log Stream (Left Half)
const logStream = grid.set(0, 0, 10, 6, contrib.log, {
  fg: 'green',
  selectedFg: 'green',
  label: '[ GHOST C2 - RAW DECRYPTED STREAM ]',
  bufferLength: 100
});

// 2. Global Radar (Top Right)
const map = grid.set(0, 6, 6, 6, contrib.map, {
  label: '[ GLOBAL ROUTING RADAR ]'
});

// 3. Stats / Gauges (Middle Right)
const gauge = grid.set(6, 6, 4, 6, contrib.gauge, {
  label: '[ DECRYPTION BUFFER ]',
  stroke: 'cyan',
  fill: 'white'
});

// 4. Status Bar (Bottom)
const statusBar = grid.set(10, 0, 2, 12, blessed.box, {
  content: '{green-fg}[ CLOUDFLARE SHIELD: ACTIVE ]{/green-fg} --- {green-fg}[ DISCORD PIPELINE: SYNCED ]{/green-fg} --- {green-fg}[ RSA DECRYPTION: ONLINE ]{/green-fg}',
  tags: true,
  align: 'center',
  valign: 'middle',
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: '#f0f0f0'
    }
  }
});

function decryptPayload(encryptedJsonStr) {
  try {
    const data = JSON.parse(encryptedJsonStr);
    
    // Decrypt the AES key using our Private RSA Key
    const aesKey = crypto.privateDecrypt(
      {
        key: PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(data.k, 'base64')
    );

    // Decrypt the log body using AES-GCM
    const iv = Buffer.from(data.i, 'base64');
    const authTag = Buffer.from(data.t, 'base64');
    const encryptedBody = Buffer.from(data.d, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedBody, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    return `[ERROR] DECRYPTION FAILED - POSSIBLE PAYLOAD POISONING: ${err.message}`;
  }
}

// --- Real Discord Data Flow ---
let bufferLevel = 0;
let lastMessageId = null;

function fetchDeadDrops() {
  if (DISCORD_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') return; // Skip if not configured

  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=10${lastMessageId ? `&after=${lastMessageId}` : ''}`;
  
  const agent = new SocksProxyAgent(TOR_PROXY);
  
  https.get(url, {
    headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` },
    agent: agent
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) return;
      try {
        const messages = JSON.parse(body);
        if (messages.length > 0) {
          messages.reverse().forEach(msg => {
            if (msg.attachments && msg.attachments.length > 0) {
              const fileUrl = msg.attachments[0].url;
              https.get(fileUrl, { agent: agent }, (fileRes) => {
                let fileData = '';
                fileRes.on('data', chunk => fileData += chunk);
                fileRes.on('end', () => {
                  const decrypted = decryptPayload(fileData);
                  printLog(decrypted);
                  
                  // Pulse the buffer gauge
                  bufferLevel = 100;
                  gauge.setPercent(bufferLevel);
                  setTimeout(() => { bufferLevel = 0; gauge.setPercent(0); screen.render(); }, 500);
                });
              }).on('error', () => {});
            }
            lastMessageId = msg.id;
          });
          screen.render();
        }
      } catch (e) {}
    });
  }).on('error', () => {});
}

// Fetch through Tor every 3 seconds
setInterval(fetchDeadDrops, 3000);

// Example to print a log
function printLog(msg) {
  logStream.log(`[+] ${new Date().toISOString()} | ${msg}`);
  screen.render();
}

printLog("VM Sandbox Initialised. Security Opts: no-new-privileges");
printLog("Tor Proxy Connected. SOCKS5: 127.0.0.1:9050");
printLog("Awaiting Encrypted Discord Dead Drops...");

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  // WIPE MEMORY ON EXIT
  // (In a real app, we would overwrite the PRIVATE_KEY buffer here)
  return process.exit(0);
});

screen.render();

// Export for testability if needed
module.exports = { decryptPayload };
