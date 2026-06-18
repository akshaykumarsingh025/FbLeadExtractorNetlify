import { supabase } from './supabase.js'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'

export async function ensureAccessToken(connection: {
  id: string
  access_token: string
  refresh_token?: string | null
  expires_at?: string | null
}): Promise<string> {
  if (connection.expires_at && new Date(connection.expires_at) > new Date()) {
    return connection.access_token
  }

  if (!connection.refresh_token) {
    throw new Error('Google token expired and no refresh token available')
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    refresh_token: connection.refresh_token,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error_description || 'Failed to refresh Google token')
  }

  const data = await res.json()
  const newAccessToken = data.access_token
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined

  await supabase
    .from('connections')
    .update({
      access_token: newAccessToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)

  return newAccessToken
}

async function fetchWithToken(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Google API error: ${res.statusText}`)
  }
  return res.json()
}

export async function getSpreadsheets(accessToken: string) {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id, name)',
    orderBy: 'modifiedByMeTime desc',
    pageSize: '50',
  })
  const data = await fetchWithToken(`${DRIVE_API}?${params}`, accessToken)
  return data.files || []
}

export async function getWorksheets(accessToken: string, spreadsheetId: string) {
  const data = await fetchWithToken(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`,
    accessToken
  )
  return (data.sheets || []).map((s: { properties?: { title?: string } }) => s.properties?.title).filter(Boolean) as string[]
}

export async function getSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  worksheetName: string
): Promise<string[]> {
  const range = encodeURIComponent(`${worksheetName}!1:1`)
  const data = await fetchWithToken(
    `${SHEETS_API}/${spreadsheetId}/values/${range}`,
    accessToken
  )
  return data.values?.[0] || []
}

export async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  worksheetName: string,
  rows: string[][]
) {
  if (rows.length === 0) return { updates: { updatedRange: '' } }
  const range = encodeURIComponent(`${worksheetName}!A:Z`)
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const data = await fetchWithToken(url, accessToken, {
    method: 'POST',
    body: JSON.stringify({ values: rows }),
  })
  return data
}

export async function createSpreadsheet(
  accessToken: string,
  title: string,
  headers: string[]
) {
  const data = await fetchWithToken(SHEETS_API, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: { title: 'Sheet1' },
        data: [{
          rowData: [{
            values: headers.map(h => ({ userEnteredValue: { stringValue: h } })),
          }],
        }],
      }],
    }),
  })
  return data
}
