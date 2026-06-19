import type { Handler, HandlerEvent } from '@netlify/functions'
import { getConnection } from './lib/supabase.js'
import { ensureAccessToken, createSpreadsheet } from './lib/google-sheets.js'

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  try {
    const body = JSON.parse(event.body || '{}')
    const userId = body.userId
    const title = body.title
    const headers = body.headers

    if (!userId) return { statusCode: 400, body: 'Missing userId' }
    if (!title) return { statusCode: 400, body: 'Missing title' }
    if (!headers || !Array.isArray(headers)) return { statusCode: 400, body: 'Missing headers' }

    const conn = await getConnection(userId, 'google')
    if (!conn) return { statusCode: 400, body: 'Google not connected' }

    const token = await ensureAccessToken(conn)
    const spreadsheet = await createSpreadsheet(token, title, headers)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: spreadsheet.spreadsheetId,
        name: spreadsheet.properties?.title || title,
      }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
