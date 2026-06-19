import type { Handler, HandlerEvent } from '@netlify/functions'
import { getConnection } from './lib/supabase.js'
import { fetchPageForms, ensureFacebookToken } from './lib/facebook.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  const pageId = event.queryStringParameters?.pageId
  if (!userId || !pageId) return { statusCode: 400, body: 'Missing userId or pageId' }

  try {
    const conn = await getConnection(userId, 'facebook')
    if (!conn) return { statusCode: 400, body: 'Facebook not connected' }

    const token = await ensureFacebookToken(conn)
    const forms = await fetchPageForms(pageId, token)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forms) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
