import type { Handler, HandlerEvent } from '@netlify/functions'
import { supabase, getIntegrations, getIntegration, deleteIntegration, addAuditLog, getConnection } from './lib/supabase.js'

export const handler: Handler = async (event: HandlerEvent) => {
  const userId = event.queryStringParameters?.userId
  if (!userId) return { statusCode: 400, body: 'Missing userId' }
  const method = event.httpMethod
  const path = event.path

  try {
    if (method === 'GET') {
      if (path.endsWith('/all')) {
        const data = await getIntegrations(userId)
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      }
      const integrations = await getIntegrations(userId)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(integrations) }
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')

      // Look up connection IDs from the database
      const fbConn = await getConnection(userId, 'facebook')
      const gsConn = await getConnection(userId, 'google')
      if (!fbConn || !gsConn) {
        return { statusCode: 400, body: 'Both Facebook and Google must be connected before creating an integration' }
      }

      const { data, error } = await supabase.from('integrations').insert({
        user_id: userId,
        name: body.name,
        facebook_page_id: body.facebookPageId,
        facebook_form_id: body.facebookFormId,
        facebook_connection_id: fbConn.id,
        google_sheet_id: body.googleSheetId,
        google_worksheet_name: body.googleWorksheetName || 'Sheet1',
        google_connection_id: gsConn.id,
        field_mappings: body.fieldMappings || [],
      }).select('id').single()
      if (error) throw error

      await addAuditLog({
        integrationId: data.id,
        eventType: 'integration.created',
        details: { name: body.name },
      })

      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    }

    if (method === 'PUT') {
      const body = JSON.parse(event.body || '{}')
      const { error } = await supabase.from('integrations').update({
        name: body.name,
        facebook_page_id: body.facebookPageId,
        facebook_form_id: body.facebookFormId,
        google_sheet_id: body.googleSheetId,
        google_worksheet_name: body.googleWorksheetName,
        field_mappings: body.fieldMappings,
        is_active: body.isActive,
        updated_at: new Date().toISOString(),
      }).eq('id', body.id)
      if (error) throw error

      return { statusCode: 200, body: 'Updated' }
    }

    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id
      if (!id) return { statusCode: 400, body: 'Missing id' }
      await deleteIntegration(id)
      return { statusCode: 200, body: 'Deleted' }
    }

    return { statusCode: 405, body: 'Method not allowed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return { statusCode: 500, body: message }
  }
}
