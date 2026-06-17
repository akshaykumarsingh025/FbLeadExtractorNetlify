import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const app = express()
const PORT = 8888

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── OAuth endpoints ──────────────────────────────────
app.get('/api/oauth-facebook', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing userId')

  const clientId = process.env.FACEBOOK_APP_ID || 'test-fb-id'
  const redirectUri = `http://localhost:${PORT}/api/oauth-callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state: JSON.stringify({ userId, service: 'facebook' }),
    scope: 'pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_leads,pages_read_user_content',
    response_type: 'code',
  })

  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params}`)
})

app.get('/api/oauth-google', (req, res) => {
  const userId = req.query.userId
  if (!userId) return res.status(400).send('Missing userId')

  const clientId = process.env.GOOGLE_CLIENT_ID || 'test-google-id'
  const redirectUri = `http://localhost:${PORT}/api/oauth-callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
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

  if (error) {
    return res.status(400).send(`Auth error: ${error}`)
  }
  if (!code || !state) {
    return res.status(400).send('Missing code or state')
  }

  let stateData
  try {
    stateData = JSON.parse(state)
  } catch {
    return res.status(400).send('Invalid state')
  }

  const { userId, service } = stateData
  const redirectUri = `http://localhost:${PORT}/api/oauth-callback`

  try {
    let tokenData = {}

    if (service === 'facebook') {
      const params = new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID || '',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        redirect_uri: redirectUri,
        code,
      })
      const r = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params}`)
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error?.message || 'FB token exchange failed')
      }
      tokenData = await r.json()
    } else {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      })
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error_description || 'Google token exchange failed')
      }
      tokenData = await r.json()
    }

    // Store token locally for now
    const tokensPath = path.join(ROOT, '.tokens.json')
    let tokens = {}
    try { tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8')) } catch {}
    tokens[`${userId}_${service}`] = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      metadata: {},
    }
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2))

    res.redirect(`http://localhost:5173/?auth=success&service=${service}`)
  } catch (err) {
    res.status(500).send(err.message)
  }
})

// ─── Data API endpoints (mock/simplified) ─────────────
function getToken(userId, service) {
  const tokensPath = path.join(ROOT, '.tokens.json')
  try {
    const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'))
    return tokens[`${userId}_${service}`]?.access_token
  } catch {
    return null
  }
}

app.get('/api/list-pages', async (req, res) => {
  const token = getToken(req.query.userId, 'facebook')
  if (!token) return res.status(400).send('Facebook not connected')

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${token}&fields=id,name`)
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
    const d = await r.json()
    res.json(d.data || [])
  } catch (err) { res.status(500).send(err.message) }
})

app.get('/api/list-forms', async (req, res) => {
  const token = getToken(req.query.userId, 'facebook')
  if (!token || !req.query.pageId) return res.status(400).send('Missing params')

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${req.query.pageId}/leadgen_forms?access_token=${token}`)
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
    const d = await r.json()
    res.json(d.data || [])
  } catch (err) { res.status(500).send(err.message) }
})

app.get('/api/list-spreadsheets', async (req, res) => {
  const token = getToken(req.query.userId, 'google')
  if (!token) return res.status(400).send('Google not connected')

  try {
    const r = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&fields=files(id%2Cname)&orderBy=modifiedByMeTime+desc&pageSize=50', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return res.status(400).send('Failed to fetch sheets')
    const d = await r.json()
    res.json(d.files || [])
  } catch (err) { res.status(500).send(err.message) }
})

app.get('/api/list-worksheets', async (req, res) => {
  const token = getToken(req.query.userId, 'google')
  if (!token || !req.query.sheetId) return res.status(400).send('Missing params')

  try {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${req.query.sheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return res.status(400).send('Failed to fetch sheets')
    const d = await r.json()
    res.json((d.sheets || []).map(s => s.properties?.title).filter(Boolean))
  } catch (err) { res.status(500).send(err.message) }
})

app.get('/api/get-form-fields', async (req, res) => {
  const token = getToken(req.query.userId, 'facebook')
  if (!token || !req.query.formId) return res.status(400).send('Missing params')

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${req.query.formId}?access_token=${token}&fields=id,name,questions`)
    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
    const d = await r.json()
    res.json({ id: d.id, name: d.name, questions: (d.questions || []).map(q => ({ key: q.key, label: q.label })) })
  } catch (err) { res.status(500).send(err.message) }
})

app.get('/api/get-sheet-headers', async (req, res) => {
  const token = getToken(req.query.userId, 'google')
  if (!token || !req.query.sheetId) return res.status(400).send('Missing params')

  try {
    const ws = req.query.worksheet || 'Sheet1'
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${req.query.sheetId}/values/${ws}!1:1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return res.status(400).send('Failed to fetch headers')
    const d = await r.json()
    res.json(d.values?.[0] || [])
  } catch (err) { res.status(500).send(err.message) }
})

// ─── File-based token storage for integration CRUD ─────
const DB_PATH = path.join(ROOT, '.db.json')

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) }
  catch { return { integrations: [], processed_leads: [], audit_logs: [] } }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

app.get('/api/integrations', (req, res) => {
  const db = readDB()
  const userInts = db.integrations.filter(i => i.user_id === req.query.userId)
  res.json(userInts)
})

app.post('/api/integrations', (req, res) => {
  const body = req.body
  const db = readDB()
  const id = crypto.randomUUID()
  db.integrations.push({
    id,
    user_id: req.query.userId,
    name: body.name,
    facebook_page_id: body.facebookPageId,
    facebook_form_id: body.facebookFormId,
    google_sheet_id: body.googleSheetId,
    google_worksheet_name: body.googleWorksheetName || 'Sheet1',
    field_mappings: body.fieldMappings || [],
    is_active: true,
    last_polled_at: null,
    created_at: new Date().toISOString(),
  })
  db.audit_logs.push({
    id: crypto.randomUUID(),
    integration_id: id,
    event_type: 'integration.created',
    details: { name: body.name },
    created_at: new Date().toISOString(),
  })
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
  const db = readDB()
  let logs = db.audit_logs
  if (req.query.integrationId) {
    logs = logs.filter(l => l.integration_id === req.query.integrationId)
  }
  logs = logs.slice(-100).reverse()
  res.json(logs)
})

// ─── Start ─────────────────────────────────────────────
console.log(`\n🚀 Dev API server running on http://localhost:${PORT}`)
console.log(`   Frontend should be on http://localhost:5173\n`)

app.listen(PORT)
