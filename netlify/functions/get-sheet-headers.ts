import type { Handler, HandlerEvent } from '@netlify/functions'
import { getConnection } from './lib/supabase.js'
import { getSheetHeaders } from './lib/google-sheets.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  const sheetId = event.queryStringParameters?.sheetId
  const worksheet = event.queryStringParameters?.worksheet || 'Sheet1'
  if (!userId || !sheetId) return { statusCode: 400, body: 'Missing userId or sheetId' }

  try {
    const conn = await getConnection(userId, 'google')
    if (!conn) return { statusCode: 400, body: 'Google not connected' }

    const headers = await getSheetHeaders(conn.access_token, sheetId, worksheet)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(headers) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
