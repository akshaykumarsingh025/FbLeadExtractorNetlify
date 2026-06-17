import type { Handler, HandlerEvent } from '@netlify/functions'
import { getConnection } from './lib/supabase.js'
import { getSpreadsheets } from './lib/google-sheets.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  if (!userId) return { statusCode: 400, body: 'Missing userId' }

  try {
    const conn = await getConnection(userId, 'google')
    if (!conn) return { statusCode: 400, body: 'Google not connected' }

    const sheets = await getSpreadsheets(conn.access_token)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheets) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
