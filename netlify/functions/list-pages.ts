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
    const safe = pages.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safe) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
