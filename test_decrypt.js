const https = require('https');
const crypto = require('crypto');

const DISCORD_BOT_TOKEN = 'YOUR_DISCORD_BOT_TOKEN_HERE';
const DISCORD_CHANNEL_ID = '1512882390295646248';

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

function decryptPayload(encryptedJsonStr) {
  try {
    const data = JSON.parse(encryptedJsonStr);
    const aesKey = crypto.privateDecrypt(
      { key: PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(data.k, 'base64')
    );
    const iv = Buffer.from(data.i, 'base64');
    const authTag = Buffer.from(data.t, 'base64');
    const encryptedBody = Buffer.from(data.d, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedBody, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return `[ERROR] DECRYPTION FAILED: ${err.message}`;
  }
}

const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=2`;
https.get(url, { headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const messages = JSON.parse(body);
    messages.forEach(msg => {
      if (msg.attachments && msg.attachments.length > 0) {
        https.get(msg.attachments[0].url, (fileRes) => {
          let fileData = '';
          fileRes.on('data', chunk => fileData += chunk);
          fileRes.on('end', () => {
             console.log("Raw File Data:", fileData.substring(0, 50) + "...");
             console.log("Decrypted:\n", decryptPayload(fileData));
             console.log("-----");
          });
        });
      }
    });
  });
});
