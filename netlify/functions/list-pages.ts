import type { Handler, HandlerEvent } from '@netlify/functions'
import { getConnection } from './lib/supabase.js'
import { fetchUserPages } from './lib/facebook.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  if (!userId) return { statusCode: 400, body: 'Missing userId' }

  try {
    const conn = await getConnection(userId, 'facebook')
    if (!conn) return { statusCode: 400, body: 'Facebook not connected' }

    const pages = await fetchUserPages(conn.access_token)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pages) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
