/**
 * GhostSwarm Signaling Server v2 (Cloudflare Worker — KV-backed)
 * 
 * Uses Cloudflare KV for persistent state so relay registrations
 * and signaling messages survive across Worker isolate restarts.
 * 
 * SETUP:
 *   1. Create a KV namespace called "SWARM" in Cloudflare Dashboard
 *   2. Bind it to this Worker under Settings → Variables → KV Namespace Bindings
 *      Variable name: SWARM
 * 
 * Deploy: Paste this into Cloudflare Dashboard → Workers → Quick Edit
 */

const RELAY_TTL = 120  // seconds — how long a relay registration lives in KV
const MSG_TTL = 60     // seconds — how long signaling messages live

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ── POST /register — Relay announces itself ──
    if (path === '/register' && request.method === 'POST') {
      const body = await request.json()
      const relayId = body.id
      if (!relayId) {
        return new Response(JSON.stringify({ error: 'Missing id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Store relay in KV with TTL (auto-expires)
      await SWARM.put(`relay:${relayId}`, JSON.stringify({ ts: Date.now() }), {
        expirationTtl: RELAY_TTL
      })

      // Count active relays
      const relayList = await SWARM.list({ prefix: 'relay:' })
      const activeRelays = relayList.keys.length

      return new Response(JSON.stringify({ status: 'ok', activeRelays }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── POST /offer — Client sends SDP offer, gets matched to a relay ──
    if (path === '/offer' && request.method === 'POST') {
      const body = await request.json()

      // Find available relays
      const relayList = await SWARM.list({ prefix: 'relay:' })
      if (relayList.keys.length === 0) {
        return new Response(JSON.stringify({ error: 'No relays available' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Pick a random relay
      const randomKey = relayList.keys[Math.floor(Math.random() * relayList.keys.length)]
      const targetRelay = randomKey.name.replace('relay:', '')

      // Store the offer as a message for the relay
      await appendMessage(targetRelay, {
        type: 'offer',
        from: body.id,
        sdp: body.sdp
      })

      return new Response(JSON.stringify({ status: 'ok', relayId: targetRelay }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── POST /answer — Relay sends SDP answer back to client ──
    if (path === '/answer' && request.method === 'POST') {
      const body = await request.json()
      await appendMessage(body.targetId, {
        type: 'answer',
        from: body.id,
        sdp: body.sdp
      })
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── POST /ice — Exchange ICE candidates ──
    if (path === '/ice' && request.method === 'POST') {
      const body = await request.json()
      await appendMessage(body.targetId, {
        type: 'ice',
        from: body.id,
        candidate: body.candidate
      })
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── GET /poll — Peers poll for messages ──
    if (path === '/poll' && request.method === 'GET') {
      const id = url.searchParams.get('id')
      if (!id) {
        return new Response('Missing id', { status: 400, headers: corsHeaders })
      }

      const raw = await SWARM.get(`msg:${id}`)
      const msgs = raw ? JSON.parse(raw) : []

      // Clear after reading
      if (msgs.length > 0) {
        await SWARM.delete(`msg:${id}`)
      }

      return new Response(JSON.stringify({ messages: msgs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── GET /status — Debug endpoint ──
    if (path === '/status' && request.method === 'GET') {
      const relayList = await SWARM.list({ prefix: 'relay:' })
      return new Response(JSON.stringify({
        activeRelays: relayList.keys.length,
        relays: relayList.keys.map(k => k.name.replace('relay:', ''))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response('GhostSwarm Signaling Server v2 (KV-backed) is running', {
      status: 200, headers: corsHeaders
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Append a signaling message for a target peer.
 * Messages are stored as a JSON array in KV with a TTL.
 */
async function appendMessage(targetId, msg) {
  const key = `msg:${targetId}`
  const raw = await SWARM.get(key)
  const existing = raw ? JSON.parse(raw) : []
  existing.push(msg)
  await SWARM.put(key, JSON.stringify(existing), { expirationTtl: MSG_TTL })
}
