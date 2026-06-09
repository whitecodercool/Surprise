const https = require('https');

const DISCORD_BOT_TOKEN = 'YOUR_DISCORD_BOT_TOKEN_HERE';
const DISCORD_CHANNEL_ID = '1512882390295646248';

const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=5`;

console.log("Fetching from Discord...");

https.get(url, {
  headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
}, (res) => {
  console.log("Status Code:", res.statusCode);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200) {
        console.error("Error Body:", body);
        return;
    }
    const messages = JSON.parse(body);
    console.log(`Found ${messages.length} messages.`);
    if (messages.length > 0) {
      const msg = messages[0];
      console.log("Latest Message Attachments:", msg.attachments.length);
      if (msg.attachments.length > 0) {
          console.log("Attachment URL:", msg.attachments[0].url);
      }
    }
  });
}).on('error', (err) => console.error(err));
