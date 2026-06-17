import type { Handler, HandlerEvent } from '@netlify/functions'
import { getConnection } from './lib/supabase.js'
import { fetchFormStructure } from './lib/facebook.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  const formId = event.queryStringParameters?.formId
  if (!userId || !formId) return { statusCode: 400, body: 'Missing userId or formId' }

  try {
    const conn = await getConnection(userId, 'facebook')
    if (!conn) return { statusCode: 400, body: 'Facebook not connected' }

    const form = await fetchFormStructure(formId, conn.access_token)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
