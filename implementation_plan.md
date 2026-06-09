# C2 Terminal Architecture: Discord Relay Pipeline

This plan outlines the implementation for the highly-anonymous, zero-infrastructure telemetry pipeline. We will use Discord as an encrypted buffer to route GhostStack telemetry from the Flux browser to your C2 Terminal.

## User Review Required

> [!IMPORTANT]
> To execute this plan, I need you to securely provide me with the following credentials after you approve the plan:
> 1. **At least one Discord Webhook URL** (e.g., from a `#critical-alerts` channel). You can provide up to 4 if you want to categorize traffic.
> 2. **A Discord Bot Token** (from the Discord Developer Portal) that has read-access to those channels.

> [!NOTE]
> For maximum anonymity, remember to create the Discord account and server using a burner email via the Tor browser, and only ever access the Discord Developer portal through Tor/VPN.

## Architecture Overview

1. **Flux Browser (The Sender)**: Encrypts the JSON telemetry using your `public.pem` key. Sends an HTTP POST to a Discord Webhook URL.
2. **Discord (The Buffer)**: Stores the encrypted payloads securely and indefinitely.
3. **C2 Terminal (The Receiver)**:
   - **Catch-up Mode:** On startup, reads a local `last_seen_id.txt` file. Uses the Discord REST API to fetch all messages that arrived while the terminal was offline, ensuring perfect chronological order.
   - **Live Mode:** Connects to the Discord Bot Gateway (WebSocket) for a real-time, low-latency stream of new incoming alerts.
   - **Decryption:** Uses your physical USB `private.pem` to decrypt the payloads locally before rendering.

---

## Proposed Changes

### Component 1: Flux Browser (Telemetry Client)

#### [MODIFY] [GhostStackOrchestrator.ts](file:///c:/Users/Ashish%20Goyal/Documents/flux/flux/src/ghoststack/core/GhostStackOrchestrator.ts)
- Replace the current `console.log` approach.
- Add an asynchronous method to handle sending telemetry to Discord.
- Include a mechanism to encrypt the payload with a hardcoded or bundled RSA public key.
- Send a `POST` request to the configured Discord Webhook URL(s).
- Ensure this is a "fire-and-forget" network request that never blocks the browser or impacts user experience if it fails.

#### [NEW] `src/shared/keys/public.pem`
- We will need to generate a matching public key for your existing `private.pem` and bundle it inside the browser.

---

### Component 2: C2 Terminal (SIEM Dashboard)

#### [MODIFY] [package.json](file:///c:/Users/Ashish%20Goyal/Documents/flux/c2-terminal/package.json)
- Install a lightweight HTTP/WebSocket client or the official `discord.js` library to interact with the Discord API.

#### [NEW] `c2-terminal/discordClient.js`
- Create a dedicated module to handle the Discord API logic.
- Implement `fetchOfflineMessages(lastSeenId)` to grab historical logs.
- Implement `connectGateway(onMessageCallback)` to listen for live events.
- Manage the state of `last_seen_id.txt` to remember the most recently processed message snowflake.

#### [MODIFY] [main.js](file:///c:/Users/Ashish%20Goyal/Documents/flux/c2-terminal/main.js)
- Completely remove the local file polling logic (`startDiscordStream`, `fs.statSync`, etc.).
- Initialize the `discordClient.js` logic after the USB Hardware Key is successfully authenticated.
- Pass incoming encrypted payloads from Discord to the frontend via `mainWindow.webContents.send('log-data', ...)`.

#### [MODIFY] [app.js](file:///c:/Users/Ashish%20Goyal/Documents/flux/c2-terminal/app.js)
- Update the payload parser. The incoming data will now be the raw text from Discord (which is encrypted).
- Ensure the decryption engine processes the incoming string and formats it into the existing Tabular UI.

## Verification Plan

### Automated Tests
- N/A - E2E manual testing required due to hardware key and network dependencies.

### Manual Verification
1. Start the C2 Terminal. Verify it authenticates via USB and connects to Discord.
2. Launch the Flux browser. Trigger a simulated or real firewall block.
3. Verify the alert appears instantly in the C2 Terminal.
4. Close the C2 Terminal.
5. Trigger 3 more firewall blocks in the Flux browser.
6. Re-open the C2 Terminal. Verify all 3 alerts are immediately downloaded and rendered in the correct chronological order.
