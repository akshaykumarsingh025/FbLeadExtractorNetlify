import type { Handler, HandlerEvent } from '@netlify/functions'
import { supabase } from './lib/supabase.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  const integrationId = event.queryStringParameters?.integrationId
  if (!userId) return { statusCode: 400, body: 'Missing userId' }

  try {
    let query = supabase
      .from('audit_logs')
      .select('*, integrations!inner(name)')
      .eq('integrations.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (integrationId) {
      query = query.eq('integration_id', integrationId)
    }

    const { data, error } = await query
    if (error) throw error

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
