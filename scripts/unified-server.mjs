// Unified dev server - serves both API + frontend on one port
import express from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Load .env file
try {
  const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch {}

const app = express()
const PORT = process.env.PORT || 5173

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── OAuth endpoints ──────────────────────────────────
app.get('/api/oauth-facebook', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing userId')
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || '',
    redirect_uri: `http://localhost:${PORT}/api/oauth-callback`,
    state: JSON.stringify({ userId, service: 'facebook' }),
    scope: 'pages_show_list,pages_read_engagement,pages_manage_ads,leads_retrieval,pages_read_user_content',
    response_type: 'code',
  })
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params}`)
})

app.get('/api/oauth-google', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing userId')
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: `http://localhost:${PORT}/api/oauth-callback`,
    state: JSON.stringify({ userId, service: 'google' }),
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

app.all('/api/oauth-callback', async (req, res) => {
  const { code, state, error } = req.query
  if (error) return res.status(400).send(`Auth error: ${error}`)
  if (!code || !state) return res.status(400).send('Missing code or state')

  let stateData
  try { stateData = JSON.parse(state) } catch { return res.status(400).send('Invalid state') }

  const { userId, service } = stateData
  const redirectUri = `http://localhost:${PORT}/api/oauth-callback`

  try {
    let tokenData = {}
    if (service === 'facebook') {
      const p = new URLSearchParams({ client_id: process.env.FACEBOOK_APP_ID || '', client_secret: process.env.FACEBOOK_APP_SECRET || '', redirect_uri: redirectUri, code })
      const r = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${p}`)
      if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || 'FB failed') }
      tokenData = await r.json()
    } else {
      const p = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: redirectUri, code, grant_type: 'authorization_code' })
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error_description || 'Google failed') }
      tokenData = await r.json()
    }

    const tokensPath = path.join(ROOT, '.tokens.json')
    let tokens = {}
    try { tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8')) } catch {}
    tokens[`${userId}_${service}`] = { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null }
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2))

    return res.redirect(`http://localhost:${PORT}/?auth=success&service=${service}`)
  } catch (err) { res.status(500).send(err.message) }
})

// ─── Token helper ─────────────────────────────────────
function getToken(userId, service) {
  try {
    const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, '.tokens.json'), 'utf-8'))
    return tokens[`${userId}_${service}`]?.access_token
  } catch { return null }
}

// ─── Facebook Data APIs ───────────────────────────────
app.get('/api/list-pages', async (req, res) => {
  const t = getToken(req.query.userId, 'facebook')
  if (!t) return res.status(400).json({ error: 'Facebook not connected' })
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${t}&fields=id,name`)
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
    res.json((await r.json()).data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/list-forms', async (req, res) => {
  const t = getToken(req.query.userId, 'facebook')
  if (!t || !req.query.pageId) return res.status(400).json({ error: 'Missing params' })
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${req.query.pageId}/leadgen_forms?access_token=${t}`)
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
    res.json((await r.json()).data || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/get-form-fields', async (req, res) => {
  const t = getToken(req.query.userId, 'facebook')
  if (!t || !req.query.formId) return res.status(400).json({ error: 'Missing params' })
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${req.query.formId}?access_token=${t}&fields=id,name,questions`)
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
    const d = await r.json()
    res.json({ id: d.id, name: d.name, questions: (d.questions || []).map(q => ({ key: q.key, label: q.label })) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Google Sheets Data APIs ──────────────────────────
app.get('/api/list-spreadsheets', async (req, res) => {
  const t = getToken(req.query.userId, 'google')
  if (!t) return res.status(400).json({ error: 'Google not connected' })
  try {
    const r = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType=\'application/vnd.google-apps.spreadsheet\'&fields=files(id,name)&orderBy=modifiedByMeTime+desc&pageSize=50', { headers: { Authorization: `Bearer ${t}` } })
    if (!r.ok) return res.status(400).json({ error: 'Failed' })
    res.json((await r.json()).files || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/list-worksheets', async (req, res) => {
  const t = getToken(req.query.userId, 'google')
  if (!t || !req.query.sheetId) return res.status(400).json({ error: 'Missing params' })
  try {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${req.query.sheetId}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${t}` } })
    if (!r.ok) return res.status(400).json({ error: 'Failed' })
    res.json((await r.json()).sheets?.map(s => s.properties?.title).filter(Boolean) || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/get-sheet-headers', async (req, res) => {
  const t = getToken(req.query.userId, 'google')
  if (!t || !req.query.sheetId) return res.status(400).json({ error: 'Missing params' })
  try {
    const ws = req.query.worksheet || 'Sheet1'
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${req.query.sheetId}/values/${ws}!1:1`, { headers: { Authorization: `Bearer ${t}` } })
    if (!r.ok) return res.status(400).json({ error: 'Failed' })
    res.json((await r.json()).values?.[0] || [])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Token helpers ────────────────────────────────────
const TOKENS_PATH = path.join(ROOT, '.tokens.json')
function readTokens() { try { return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8')) } catch { return {} } }
function writeTokens(t) { fs.writeFileSync(TOKENS_PATH, JSON.stringify(t, null, 2)) }

// Refresh a Google token if missing or expiring within 5 minutes.
// Returns a valid access token, or null if it cannot be refreshed.
async function ensureGoogleToken(userId) {
  const tokens = readTokens()
  const key = `${userId}_google`
  const entry = tokens[key]
  if (!entry) return null

  // Still valid (5-min safety margin)?
  if (entry.access_token && entry.expires_at && entry.expires_at > Date.now() + 5 * 60 * 1000) {
    return entry.access_token
  }
  if (!entry.refresh_token) return null

  try {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: entry.refresh_token,
      grant_type: 'refresh_token',
    })
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    if (!r.ok) return null
    const data = await r.json()
    const updated = {
      access_token: data.access_token,
      refresh_token: entry.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    }
    tokens[key] = updated
    writeTokens(tokens)
    return updated.access_token
  } catch {
    return null
  }
}

// ─── Local file-based DB ──────────────────────────────
const DB_PATH = path.join(ROOT, '.db.json')
function readDB() { try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) } catch { return { integrations: [], processed_leads: [], audit_logs: [] } } }
function writeDB(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)) }

app.get('/api/integrations', (req, res) => {
  res.json(readDB().integrations.filter(i => i.user_id === req.query.userId))
})

app.post('/api/integrations', (req, res) => {
  const body = req.body
  const db = readDB()
  const id = crypto.randomUUID()
  db.integrations.push({
    id, user_id: req.query.userId, name: body.name,
    facebook_page_id: body.facebookPageId, facebook_form_id: body.facebookFormId,
    google_sheet_id: body.googleSheetId, google_worksheet_name: body.googleWorksheetName || 'Sheet1',
    field_mappings: body.fieldMappings || [], is_active: true,
    last_polled_at: null, created_at: new Date().toISOString(),
  })
  db.audit_logs.push({ id: crypto.randomUUID(), integration_id: id, event_type: 'integration.created', details: { name: body.name }, created_at: new Date().toISOString() })
  writeDB(db)
  res.json({ id })
})

app.delete('/api/integrations', (req, res) => {
  const db = readDB()
  db.integrations = db.integrations.filter(i => i.id !== req.query.id)
  writeDB(db)
  res.send('Deleted')
})

app.get('/api/get-history', (req, res) => {
  let logs = readDB().audit_logs
  if (req.query.integrationId) logs = logs.filter(l => l.integration_id === req.query.integrationId)
  res.json(logs.slice(-100).reverse())
})

// ─── Lead sync (FB → Sheets) ──────────────────────────

// Fetch ALL leads for a form, following cursor-based pagination.
async function fetchAllLeads(formId, pageAccessToken) {
  const all = []
  let url = `https://graph.facebook.com/v19.0/${formId}/leads?access_token=${encodeURIComponent(pageAccessToken)}&fields=id,created_time,field_data`
  let pages = 0
  while (url && pages < 50) { // safety cap of 50 pages (~1250 leads)
    const r = await fetch(url)
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      throw new Error(e.error?.message || `Facebook leads fetch failed (${r.status})`)
    }
    const data = await r.json()
    all.push(...(data.data || []))
    url = data.paging?.next || null // Graph returns a full ready-to-call URL
    pages++
  }
  return all
}

function extractLeadFields(lead) {
  const fields = {}
  for (const f of lead.field_data || []) {
    fields[f.name] = (f.values || []).join(', ')
  }
  return fields
}

// Build a row for a lead using the integration's field mappings + sheet headers.
function buildRow(extracted, fieldMappings, sheetHeaders) {
  return sheetHeaders.map(header => {
    const mapping = fieldMappings.find(m => m.sheetColumn === header)
    return mapping ? (extracted[mapping.facebookField] || '') : ''
  })
}

// Append one row to the sheet. Returns the updated range or null.
async function appendRowToSheet(accessToken, spreadsheetId, worksheetName, row) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(worksheetName)}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error?.message || `Sheets append failed (${r.status})`)
  }
  const data = await r.json()
  return data.updates?.updatedRange || null
}

let pollRunning = false
async function pollAllIntegrations() {
  if (pollRunning) return { skipped: 'already running' }
  pollRunning = true
  const results = []
  try {
    const db = readDB()
    const integrations = db.integrations.filter(i => i.is_active)

    for (const integration of integrations) {
      const userId = integration.user_id
      let processed = 0, failed = 0
      try {
        const fbToken = getToken(userId, 'facebook')
        const gsToken = await ensureGoogleToken(userId)
        if (!fbToken || !gsToken) {
          throw new Error('Missing Facebook or Google token (connect both accounts)')
        }

        // Fetch leads + sheet headers in parallel
        const [leads, sheetHeaders] = await Promise.all([
          fetchAllLeads(integration.facebook_form_id, fbToken),
          (async () => {
            const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${integration.google_sheet_id}/values/${encodeURIComponent(integration.google_worksheet_name)}!1:1`, { headers: { Authorization: `Bearer ${gsToken}` } })
            if (!r.ok) throw new Error('Could not read sheet headers')
            return (await r.json()).values?.[0] || []
          })(),
        ])

        const fresh = readDB() // re-read to get latest processed set
        const already = new Set(
          fresh.processed_leads
            .filter(p => p.integration_id === integration.id)
            .map(p => p.facebook_lead_id)
        )
        const fieldMappings = integration.field_mappings || []

        for (const lead of leads) {
          if (already.has(lead.id)) continue
          const extracted = extractLeadFields(lead)
          try {
            const row = buildRow(extracted, fieldMappings, sheetHeaders)
            const rowRange = await appendRowToSheet(gsToken, integration.google_sheet_id, integration.google_worksheet_name, row)
            fresh.processed_leads.push({
              id: crypto.randomUUID(),
              integration_id: integration.id,
              facebook_lead_id: lead.id,
              facebook_form_id: integration.facebook_form_id,
              data: extracted,
              sheet_row_id: rowRange,
              status: 'processed',
              processed_at: new Date().toISOString(),
            })
            processed++
          } catch (writeErr) {
            fresh.processed_leads.push({
              id: crypto.randomUUID(),
              integration_id: integration.id,
              facebook_lead_id: lead.id,
              facebook_form_id: integration.facebook_form_id,
              data: extracted,
              status: 'failed',
              error_message: writeErr.message,
              processed_at: new Date().toISOString(),
            })
            failed++
          }
        }

        fresh.audit_logs.push({
          id: crypto.randomUUID(),
          integration_id: integration.id,
          event_type: processed > 0 || failed > 0 ? 'poll.completed' : 'poll.noop',
          details: { leadsProcessed: processed, failed },
          created_at: new Date().toISOString(),
        })
        writeDB(fresh)
      } catch (err) {
        const fresh = readDB()
        fresh.audit_logs.push({
          integration_id: integration.id,
          event_type: 'poll.failed',
          details: { error: err.message },
          created_at: new Date(),
        })
        writeDB(fresh)
        results.push({ integration: integration.name, error: err.message })
        continue
      }
      results.push({ integration: integration.name, processed, failed })
    }
    return { results }
  } finally {
    pollRunning = false
  }
}

// Manual trigger route (no secret in local dev; rely on localhost-only access)
app.post('/api/poll-leads', async (req, res) => {
  try {
    const result = await pollAllIntegrations()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
// Also accept GET so it can be triggered from a browser/curl easily
app.get('/api/poll-leads', async (req, res) => {
  try {
    const result = await pollAllIntegrations()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Background sync loop — runs every POLL_INTERVAL_MS (default 1 minute for fast lead follow-up)
const POLL_INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_MINUTES, 10) > 0
  ? parseInt(process.env.POLL_INTERVAL_MINUTES, 10)
  : 1) * 60 * 1000
setInterval(() => { pollAllIntegrations().catch(() => {}) }, POLL_INTERVAL_MS)
// Run once immediately on startup so you don't wait up to 1 min for the first sync
setTimeout(() => { pollAllIntegrations().catch(() => {}) }, 5000)

// ─── Serve frontend static files ──────────────────────
const frontendDist = path.join(ROOT, 'frontend', 'dist')
app.use(express.static(frontendDist))
app.use((req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`)
  console.log(`║        LeadSync is running!                 `)
  console.log(`╠══════════════════════════════════════════════╣`)
  console.log(`║  Open: http://localhost:${PORT}                  `)
  console.log(`║  Or:   http://127.0.0.1:${PORT}               `)
  console.log(`║  Lead sync: every ${POLL_INTERVAL_MS / 60000} min (POST /api/poll-leads to trigger)`)
  console.log(`╚══════════════════════════════════════════════╝`)
  console.log(`\n  Press Ctrl+C to stop\n`)
})
